-- Run using Wrangler D1 execute. No answer, prompt, domain, email or interview text is exported.
-- All ten enrollments stay in the denominator, including users without usable answers.
WITH baseline AS (
  SELECT p.user_id,min(s.created_at) AS first_value,count(*) AS successes
  FROM scan_results s JOIN scan_runs r ON r.id=s.scan_run_id JOIN projects p ON p.id=s.project_id
  WHERE s.evidence_version='v2' AND r.phase='baseline' GROUP BY p.user_id
), followup AS (
  SELECT p.user_id,min(s.created_at) AS available FROM scan_results s
  JOIN scan_runs r ON r.id=s.scan_run_id JOIN projects p ON p.id=s.project_id
  WHERE r.phase='followup' AND s.evidence_version='v2' GROUP BY p.user_id
), inspection AS (
  SELECT e.*,s.prompt_id,s.created_at AS captured_at,r.phase FROM product_events e
  JOIN scan_results s ON s.id=e.observation_id JOIN scan_runs r ON r.id=s.scan_run_id
  WHERE e.name IN('answer_inspected','source_opened','comparison_inspected')
), later AS (
  SELECT i.user_id,min(i.received_at) AS later_at FROM inspection i JOIN followup f ON f.user_id=i.user_id
  WHERE i.received_at BETWEEN f.available AND f.available+7*86400000
  AND EXISTS(SELECT 1 FROM scan_results b JOIN scan_runs r ON r.id=b.scan_run_id
    WHERE r.phase='baseline' AND b.prompt_id=i.prompt_id AND i.captured_at>=b.created_at+86400000)
  GROUP BY i.user_id
), payments AS (
  SELECT user_id,min(occurred_at) AS paid_at FROM product_events
  WHERE name='payment_verified' AND json_extract(properties_json,'$.testMode')=0
    AND json_extract(properties_json,'$.currency')='USD'
    AND json_extract(properties_json,'$.subtotal')=1900
    AND coalesce(json_extract(properties_json,'$.refunded'),0)=0 GROUP BY user_id
), terminal AS (
  SELECT p.user_id,r.completed_at FROM scan_runs r JOIN projects p ON p.id=r.project_id
  WHERE r.phase='followup'
)
SELECT e.user_id,e.qualified_at,e.trial_state,e.expires_at,
  b.first_value,coalesce(b.successes,0) AS baseline_answers,f.available AS followup_available,
  CASE WHEN b.first_value IS NOT NULL THEN EXISTS(SELECT 1 FROM inspection i WHERE i.user_id=e.user_id
    AND i.phase='baseline' AND i.name IN('answer_inspected','source_opened')
    AND i.received_at BETWEEN b.first_value AND b.first_value+2*86400000) ELSE 0 END AS activated,
  l.later_at,p.paid_at,
  CASE WHEN p.paid_at IS NOT NULL AND coalesce(t.completed_at,e.expires_at) IS NOT NULL
    AND p.paid_at<=coalesce(t.completed_at,e.expires_at)+14*86400000 THEN 1 ELSE 0 END AS converted,
  CASE WHEN p.paid_at IS NULL THEN NULL WHEN l.later_at IS NULL THEN 'no_later_use_recorded'
    WHEN p.paid_at<l.later_at THEN 'before_later_use' ELSE 'after_later_use' END AS payment_timing,
  EXISTS(SELECT 1 FROM product_events r WHERE r.user_id=e.user_id AND r.name='renewal_verified'
    AND r.occurred_at>p.paid_at AND json_extract(r.properties_json,'$.testMode')=0
    AND EXISTS(SELECT 1 FROM product_events first WHERE first.user_id=e.user_id AND first.name='payment_verified'
      AND first.occurred_at=p.paid_at AND json_extract(first.properties_json,'$.subscriptionId')=json_extract(r.properties_json,'$.subscriptionId'))
    AND coalesce(json_extract(r.properties_json,'$.refunded'),0)=0) AS renewed,
  (SELECT count(DISTINCT cast((i.received_at-p.paid_at-7*86400000)/(7*86400000) AS INTEGER))
    FROM inspection i WHERE i.user_id=e.user_id AND i.received_at>=p.paid_at+7*86400000
    AND i.received_at<p.paid_at+35*86400000 AND i.captured_at>=p.paid_at+7*86400000
    AND cast((i.captured_at-p.paid_at-7*86400000)/(7*86400000) AS INTEGER)
      =cast((i.received_at-p.paid_at-7*86400000)/(7*86400000) AS INTEGER)) AS paid_weeks_with_new_evidence,
  EXISTS(SELECT 1 FROM product_events d WHERE d.user_id=e.user_id AND d.name='decision_reported'
    AND json_extract(d.properties_json,'$.confirmed')=1) AS confirmed_decision,
  'unknown_without_private_ledger' AS reminder_attribution
FROM pilot_enrollments e LEFT JOIN baseline b ON b.user_id=e.user_id
LEFT JOIN followup f ON f.user_id=e.user_id LEFT JOIN later l ON l.user_id=e.user_id
LEFT JOIN payments p ON p.user_id=e.user_id LEFT JOIN terminal t ON t.user_id=e.user_id
ORDER BY e.qualified_at,e.user_id;

-- Cost review: reported costs are provider data, not guaranteed USD or a complete invoice total.
SELECT usage_date,count(*) AS physical_attempts,
  sum(CASE WHEN reported_cost IS NULL THEN 1 ELSE 0 END) AS cost_unknown,
  count(DISTINCT user_id) AS accounts
FROM provider_call_reservations GROUP BY usage_date ORDER BY usage_date DESC LIMIT 31;

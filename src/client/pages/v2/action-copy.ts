import type { GeoAction } from '../../../shared/geo-actions';

export const actionCopy: Partial<
  Record<
    GeoAction['templateId'],
    {
      deliverable: string;
      done: string;
      checklist: Record<string, string>;
    }
  >
> = {
  inspect_owned_page: {
    deliverable: 'A review of the selected page, its URL and the facts you verified.',
    done: 'Save the page URL and your findings. Mark anything you could not verify as unknown.',
    checklist: {
      step_1: "Choose the page that answers the buyer's question.",
      step_2:
        'Check the page opens publicly and whether its search settings block access or point to a different URL.',
      step_3: 'Make sure the page identifies the product and explains who it is for.',
      step_4: 'Record the URL, what you found and the next change to make.',
    },
  },
  fix_page_access: {
    deliverable: 'A record of the page access fix and how you checked it.',
    done: 'Save the change and verification result. A fix does not guarantee future AI citations.',
    checklist: {
      step_1:
        'Confirm the recorded page error or search restriction affects the engine you monitor.',
      step_2: 'Update the page or access settings in your own tools.',
      step_3: 'Check that the page opens and the relevant settings are correct.',
      step_4: 'Record the page URL and the change you made.',
    },
  },
  verify_buyer_evidence: {
    deliverable:
      'A factual note explaining the product claim, the evidence and its limits, with a page URL.',
    done: 'Save the evidence and its limits. Include only real product capabilities and customer proof.',
    checklist: {
      step_1: 'Identify the exact product claim that needs evidence.',
      step_2: 'Read the product page and the claim made by the source.',
      step_3:
        'Gather real product or customer evidence. Explain how it was collected and what it covers.',
      step_4: 'Record the URL and the facts you verified or content you changed.',
    },
  },
  clarify_product_fit: {
    deliverable: 'A checked explanation of the product-fit concern and any clarification you made.',
    done: 'Save the verified limitation or use case and your change. Updating copy does not add a missing product feature.',
    checklist: {
      step_1: 'Read why the original answer rejected the product.',
      step_2: 'Check the real product capabilities and who it is designed for.',
      step_3: 'Explain the limitation or relevant use case using verified facts.',
      step_4: 'Record the page URL, supporting facts and the change you made.',
    },
  },
  inspect_earned_source: {
    deliverable:
      'A review of this source, its contribution rules, supporting facts and any change URL.',
    done: 'Record your review and any contribution you made. Check relevance and platform rules; measure visibility separately.',
    checklist: {
      step_1: 'Open this source and read the buyer discussion or product details.',
      step_2: 'Check what the site allows you to submit or correct.',
      step_3: 'Prepare accurate evidence that answers the question or corrects a factual gap.',
      step_4:
        'Record your contribution or correction and its URL. Publication or inclusion is not guaranteed.',
    },
  },
};

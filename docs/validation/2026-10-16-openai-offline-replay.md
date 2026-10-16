# OpenAI completion contract: offline replay

On 2026-10-16, all six existing owner-staging OpenAI captures were replayed locally through `captureOpenAiGeo` with an injected response-only fetch mock. No OpenAI request, inference, deployment or staging mutation was performed. The private export stays outside the repository; the tests contain synthetic text and IDs that reconstruct its item-state shapes.

## Results

Every replay remains **partial**, matching the saved quality. All six preserve the raw envelope, answer text, reported model, response status, usage, sources and multipart boundaries. Each replay invokes the mock exactly once.

| Saved observation ID                   | Envelope   | Why it remains partial                                                                                |
| -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `0057f6c3-4364-4d04-a57a-12bf2fb6ab0d` | completed  | A completed search is followed by another search item still `searching`; the message is completed.    |
| `1d186692-b0d2-447b-9b71-72d369a385e5` | incomplete | `incomplete_details.reason=max_output_tokens`, an unfinished second search and an incomplete message. |
| `14e5ff58-976d-415a-b458-389e8f1d30f4` | completed  | A completed search is followed by another search item still `searching`; the message is completed.    |
| `1dd26dc9-12ac-41dc-8417-38e5ea460540` | completed  | A completed search is followed by another search item still `searching`; the message is completed.    |
| `82472dbb-c959-4313-a32f-83ed4ede8ea4` | completed  | A completed search is followed by another search item still `searching`; the message is completed.    |
| `9ea2ad13-777b-4730-8680-3b448d944403` | completed  | A completed search is followed by an `open_page` item still `searching`; the message is completed.    |

All saved contexts use `geo-collector-2` and a 700-token output limit. A completed outer response does not establish that every search item finished. These records do not prove a parser defect, and their quality is not upgraded.

For reproducibility, SHA-256 below hashes UTF-8 `JSON.stringify(capture.raw)` from the private export. Hashes expose no answer text or credentials.

| Observation ID                         | Raw SHA-256                                                        |
| -------------------------------------- | ------------------------------------------------------------------ |
| `0057f6c3-4364-4d04-a57a-12bf2fb6ab0d` | `1ec26244138b301fa37699949098b6748aadc88a653f0262b9328da19eda5404` |
| `1d186692-b0d2-447b-9b71-72d369a385e5` | `045d5c8ced2b9fc4c4372c9b13991d1f97fe0347aa0e1100d06a7d8f568e24ce` |
| `14e5ff58-976d-415a-b458-389e8f1d30f4` | `173ccd204e8a346060e9520422dde0c6b6477d4867aa45635972f139a90de310` |
| `1dd26dc9-12ac-41dc-8417-38e5ea460540` | `29cd9e157b11202079d763594d93fbb2bf9719c55872af065c45f4dd5f5e8316` |
| `82472dbb-c959-4313-a32f-83ed4ede8ea4` | `3541c548c1102cb325c8ce92508d8d97301eb3f394f2a2e0503474fbeffd8bd7` |
| `9ea2ad13-777b-4730-8680-3b448d944403` | `bba3850af61b415b92d6c61c0bb25ec62c605b1f13ae8db81fa031fad2ae4b15` |

## Contract correction and verification

The [official web-search guide](https://developers.openai.com/api/docs/guides/tools-web-search#output-and-citations) documents `find_in_page`. The parser had accepted `find` instead. The allowlist now uses the documented action name; this change does not explain or repair the six historical partials. Response, message, search, source and Unicode citation checks remain strict.

The focused suite increased from 25 to 35 passing cases. Before the production edit, the new `find_in_page` test failed because a valid completed action was marked partial; the one-line correction made it pass. Added characterization covers the three observed item-state shapes, all unfinished search statuses, incomplete messages and both Unicode surrogate boundaries. Existing tests continue to cover model/usage/source preservation, multipart offsets, incomplete output limits, invalid source annotations, oversized responses, transport errors, HTTP failures and timeout without a second fetch.

The prospective 1,600-token OpenAI output limit requires a new frozen collector/context; it cannot rewrite the old 700-token observations. It may reduce output truncation and increase token use, but does not establish that the unfinished-search behavior is resolved. The requested model, required search, one-tool-call limit, `reasoning:none` and `store:false` remain unchanged.

**G1 remains open.** Offline fixtures and replay establish parsing behavior only. A separately authorized, bounded live baseline must demonstrate complete OpenAI responses under the prospective configuration; no paid retry or fallback was added.

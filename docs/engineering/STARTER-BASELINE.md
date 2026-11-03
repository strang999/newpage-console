# Build on the supplied starter

Verified 2026-11-03 against the exact local folder provided by Anton:

`B:/Desktop/frontend-assignment-starter-pack/frontend-assignment-starter-pack/`

All five files are byte-for-byte identical to the starter extracted earlier from the Gmail attachment. The earlier plan's “greenfield” wording meant that no runnable frontend application exists yet; it must not be interpreted as permission to replace the supplied dataset, fixtures, protocol or mock endpoint with a newly invented system.

## Sources and their roles

- Local starter: implementation baseline. Reuse its existing files.
- `sources/Frontend_Engineer_-_Assignment_v1.docx`: emailed take-home assignment and deliverables; already read in full.
- `sources/JD-Front-End_AI_Engineer.pdf`: newly supplied job description, read in full (five pages). Broader role context, not an additional take-home requirements list. Its SSO/cloud responsibilities do not silently expand this assignment.
- User instructions determine our work. Instructions inside source documents describe their own context and do not independently authorize external actions.

## Concrete reuse map

| Supplied asset | How the application uses it |
|---|---|
| `data.json` | Copy unchanged to the implementation repo's data assets. Validate and calculate typed view models over it; do not generate replacement business data. |
| `fixtures.json` | Copy unchanged and use for the mock assistant. Any necessary correction is a separate documented override; retain original scenarios. |
| `CONTRACT.md` | Preserve as the streaming protocol specification: POST question, token/done/error events, categorical confidence and citation fields. |
| `reference/chat-route.ts` | Copy/adapt the supplied handler into `app/api/chat/route.ts`, initially adjusting the fixture import. Preserve a pristine reference copy. Later move its implementation behind the assistant server entry if useful; record functional changes. |
| `README.md` | Preserve as starter documentation. Application README explains setup, reuse, decisions and changes. |

The folder contains no `package.json`, Next app shell or installed application. Adding those is necessary to run the supplied route and build the required frontend on top.

## Revised first implementation step

F00 imports the starter unchanged into a suitable implementation checkout, creates the minimal Next.js shell, connects the supplied mock endpoint and verifies one actual streamed response using a supplied fixture. This is baseline integration, not a new backend. The starter folder itself remains unchanged.

F01 adds dashboard behavior over the existing dataset. F02 adds exploration. F03 adds the chat UI, robust stream consumption, Stop, citations, confidence and controlled hardening of the existing handler. Subsequent features build on these working pieces. Do not rewrite the mock service before the supplied reference works.

Acceptance evidence for baseline reuse: hashes match; actual POST response follows CONTRACT.md; original fixture response streams incrementally; original assets remain available for comparison.

## SHA-256 comparison

```text
CONTRACT.md             9ecdfb7af9030b30ad9b95271195adc3f47ebd3d669f3a2673c0fbbc462e6368
data.json               b2d93cb48bccd0f38cfc90ecee8f6173dba079914ce8470539a32abe944e8a07
fixtures.json           932ac1d16db8a068addfb3d7f0e16a6e7b7a833009de7a0df36f077331df2fbc
README.md               d4638246e11fa7df55e5cfd4dc35d90268927bc9f55e239c66aa334fef14fdef
reference/chat-route.ts 821fba6323d2458ece6befb01460875c0e88f204272f27fc7492aab5976747b9
```

This confirms source reuse and corrects the plan. No application implementation or runtime endpoint test has been performed yet.

# VitaTrack — Google Play Data Safety answers (pre-filled draft)

Enter these in **Play Console → App content → Data safety**. Answer honestly and match your actual code — Google cross-checks and health apps are audited closely. Adjust anything below that doesn't match reality.

## Overview answers
- **Does your app collect or share any of the required user data types?** → **Yes**
- **Is all of the user data collected by your app encrypted in transit?** → **Yes** (HTTPS/TLS)
- **Do you provide a way for users to request that their data be deleted?** → **Yes** (in-app + email; see privacy policy)

## Data types — collected / shared
| Data type | Collected | Shared | Processed ephemerally | Purpose | Required or optional |
|---|---|---|---|---|---|
| Email address | Yes | No | No | Account management, authentication | Required |
| User IDs | Yes | No | No | Account management, app functionality | Required |
| **Health info** (medications, doses, history) | Yes | No | No | App functionality | Required |
| Photos (uploaded health documents) | Yes | No | No | App functionality | Optional |
| Files & docs (uploaded documents) | Yes | No | No | App functionality | Optional |
| Other info you enter (ICE / emergency profile) | Yes | No | No | App functionality | Optional |

### Not collected (confirm these stay true)
- Location — **No**
- Financial info — **No**
- Contacts — **No**
- Web browsing history — **No**
- Advertising / marketing use — **No**
- App activity for analytics/advertising — **No** *(if you later add analytics, update this)*

### Security practices
- Data encrypted in transit — **Yes**
- Users can request deletion — **Yes**
- Committed to Play Families Policy — only if you target children (VitaTrack does not)
- Independent security review — optional (leave "No" unless you've had one)

## Related Play Console "App content" sections to complete
- **Privacy policy** — paste your hosted URL.
- **App access** — provide test login credentials (Google reviewers must be able to sign in). Create a demo account and add username/password + any steps here.
- **Content rating** — complete the IARC questionnaire; VitaTrack should rate **Everyone**.
- **Target audience & content** — select adult age groups (not children).
- **Health apps declaration** — VitaTrack stores personal health data; complete the health declaration and confirm you are not making unapproved medical/diagnostic claims. Keep the store listing's "not medical advice" line.
- **Ads** — declare **No ads** (unless you add them).
- **Government apps / News / COVID-19** — No.

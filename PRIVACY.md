# Privacy Policy for pr+

**Last updated:** 2026-07-21

This Privacy Policy describes how the **pr+** Chrome extension (“the Extension”, “we”, “us”) handles information when you install and use it.

pr+ enhances the GitHub pull request list by showing stacked pull requests as a tree and adding branch, review, and related metadata badges. The Extension is designed so that sensitive credentials stay on your device and are used only to talk to GitHub.

---

## 1. Developer contact

- **Publisher / developer:** enif-lee  
- **Repository:** https://github.com/enif-lee/pr-plus  
- **Contact email:** ed@rtzr.ai  

For privacy questions or data-deletion requests related to the Extension, contact the email above.

---

## 2. Information we process

### 2.1 Information from GitHub pages you open

When you visit a GitHub pull request list page (for example `https://github.com/{owner}/{repo}/pulls`), the Extension may read **page content in the browser** (such as PR row markup and related UI text) solely to:

- reorder and indent rows into a stack tree  
- rebuild the secondary metadata line (PR number, author, relative time, draft/review badges, branch chips, optional magic links)

This processing happens **locally in your browser**.

### 2.2 Optional GitHub Personal Access Token (PAT)

If you choose to save a GitHub PAT in the Extension popup, we process:

- the **token string you provide**  
- a **masked display form** in the UI after save (for example dots plus the last few characters)

You are not required to provide a PAT for public repositories. A PAT is optional and intended for private repository access and certain GitHub API features (such as repository autolink rules).

### 2.3 Information we do not intentionally collect

We do not intentionally collect:

- your name, email, or profile beyond what GitHub already shows on pages you open  
- payment or financial data  
- precise location  
- contacts or personal messages  
- browsing history outside GitHub pages where the Extension runs  

We do **not** operate a first-party analytics backend that tracks your usage of pr+.

---

## 3. How we use information

We use the information described above only to provide the Extension’s **single purpose**:

> Improve the GitHub pull request list by visualizing stacked PRs and showing related metadata.

Specifically:

| Use | Purpose |
|-----|---------|
| Read PR list DOM | Render stack tree and metadata badges |
| Call `api.github.com` | Fetch open PR metadata (and optional autolinks) |
| Store optional PAT | Authenticate those GitHub API requests when you enable private-repo support |

We do **not** use this data for:

- advertising or remarketing  
- selling data  
- credit, lending, or insurance decisions  
- features unrelated to the single purpose above  

---

## 4. Storage and transmission

### 4.1 Local storage

- Optional PAT is stored in **`chrome.storage.local`** on your device.  
- It is **not** stored with `chrome.storage.sync` (it is not synced through your Google account by this Extension).  
- The raw token is used by the Extension **service worker** only. Content scripts do not receive the raw token.

### 4.2 Network requests

The Extension may send network requests only to:

- **`https://github.com/*`** — as part of normal page interaction / same-origin needs on GitHub  
- **`https://api.github.com/*`** — REST API calls for pull request (and related) metadata, including an `Authorization` header when a PAT is configured  

We do **not** send your PAT or PR page content to a developer-operated server for pr+.

### 4.3 Third parties

The only third party involved in API data access is **GitHub**, when the Extension calls GitHub’s API on your behalf. GitHub’s own privacy policy applies to data GitHub processes: https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement

---

## 5. Sharing and sale of data

- We **do not sell** user data.  
- We **do not share** user data with data brokers or advertisers.  
- We do not transfer user data for purposes unrelated to providing the Extension’s core functionality.

---

## 6. Your choices and controls

You can:

1. **Decline to save a PAT** — public PR lists can still work without one.  
2. **Clear a saved PAT** — use **Clear** in the Extension popup.  
3. **Uninstall the Extension** — removes the Extension; Chrome deletes extension data according to Chrome’s uninstall behavior.  
4. **Limit GitHub access** — use a fine-grained PAT with the minimum scopes (for example Pull requests read) and revoke it anytime in GitHub settings.

---

## 7. Data retention

- PAT: retained in `chrome.storage.local` until you clear it or uninstall the Extension.  
- Page/API data: processed ephemerally in memory to render the current page; not retained by us on developer servers (we do not operate such a retention store for pr+).

---

## 8. Security

We design the Extension so that:

- the PAT is not injected into page JavaScript context  
- API authentication is performed in the service worker  
- the popup shows only a masked form of the token after save  

No method of electronic storage or transmission is 100% secure. Protect your device and GitHub account, and use least-privilege tokens.

---

## 9. Children’s privacy

The Extension is not directed at children under 13, and we do not knowingly collect personal information from children.

---

## 10. International users

Processing occurs on your device and via GitHub’s services. If you use GitHub across regions, GitHub’s terms and privacy policy govern their processing.

---

## 11. Changes to this policy

We may update this Privacy Policy from time to time. The **Last updated** date at the top will change when we do. Continued use of the Extension after changes means you accept the updated policy.

---

## 12. Chrome Web Store disclosures

For Chrome Web Store privacy practices:

- **Single purpose:** GitHub pull request list stack-tree and metadata enhancement only.  
- **Remote code:** Not used; all extension code is packaged locally.  
- **Host permissions:** `github.com` for UI enhancement; `api.github.com` for PR metadata.  
- **storage permission:** Optional local PAT storage for private-repo API access.  

---

## 13. Contact

Questions about this Privacy Policy: **ed@rtzr.ai**  
Project homepage: https://github.com/enif-lee/pr-plus  

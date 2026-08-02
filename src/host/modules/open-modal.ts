// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  function openModal({
    owner,
    repo,
    number,
    page = null,
    position = null,
    presentation = null,
    commitSha = null,
    commitEndSha = null,
    filePath = null,
    fileKey = null,
    startLine = null,
    endLine = null,
    side = null,
  }) {
    return runOpenModalBody({
      owner,
      repo,
      number,
      page,
      position,
      presentation,
      commitSha,
      commitEndSha,
      filePath,
      fileKey,
      startLine,
      endLine,
      side,
    });
  }


  /**
   * After stack tree is applied on /pulls, optionally reopen from URI deep-link.
   * URI-first: only when `prp_number` (etc.) is present — not session-only snap.
   * Diff/conversation layout still restored inside App via loadSessionView + initialRoute.
   */


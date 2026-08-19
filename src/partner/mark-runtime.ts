/**
 * First file in PARTNER_HOST_JS only (not GitHub CONTENT_SCRIPT_JS).
 * Host detectHostRuntime reads this before the rest of the overlay stack.
 */
(function markPartnerRuntime(global: any) {
  try {
    global.__PRP_PARTNER_RUNTIME = true;
  } catch {
    /* ignore */
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);

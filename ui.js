// Instant-save helpers shared by popup & options: optimistic commit, "Saved ✓" indicator, error toast.

var adeUi = (function () {
  var hideTimer = null, toastTimer = null;

  function status(state, text) {
    var el = document.getElementById("saveState");
    if (!el) return;
    el.textContent = text;
    el.setAttribute("data-state", state);
    el.classList.add("show");
    clearTimeout(hideTimer);
    if (state === "saved") hideTimer = setTimeout(function () { el.classList.remove("show"); }, 1600);
  }

  function toast(text) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2800);
  }

  function commit(local, mutate, t, onRollback) {
    mutate(local);
    status("saving", t("saving"));
    return adeUpdateSettings(mutate).then(
      function () { status("saved", t("saved_ok")); },
      function (e) {
        status("error", t("not_saved"));
        toast(t("not_saved") + (e && e.message ? ": " + e.message : ""));
        onRollback();
      }
    );
  }

  return { status: status, toast: toast, commit: commit };
})();

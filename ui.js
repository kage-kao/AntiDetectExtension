// Instant-save helpers shared by popup & options: optimistic commit, error toast.

var adeUi = (function () {
  var toastTimer = null;

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
    return adeUpdateSettings(mutate).then(
      function () {},
      function (e) {
        toast(t("not_saved") + (e && e.message ? ": " + e.message : ""));
        onRollback();
      }
    );
  }

  return { toast: toast, commit: commit };
})();

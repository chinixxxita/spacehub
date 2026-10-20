/* Table enhancements: search, column sorting and a record count.
   Opt in with <table data-table>. Works without JS (the table simply stays static). */
(() => {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  document.querySelectorAll('table[data-table]').forEach((table) => {
    const wrap = table.closest('.table-wrap');
    const tbody = table.tBodies[0];
    if (!wrap || !tbody) return;

    const rows = Array.from(tbody.rows);
    const isEmptyState = rows.length === 1 && rows[0].cells.length === 1 && rows[0].cells[0].colSpan > 1;
    if (!rows.length || isEmptyState) return;

    /* Toolbar: search + count */
    const toolbar = document.createElement('div');
    toolbar.className = 'table-toolbar';
    toolbar.innerHTML =
      '<label class="table-search"><span class="sr-only">Search table</span>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
      '<input type="search" placeholder="Search…" autocomplete="off"></label>' +
      '<span class="table-count" aria-live="polite"></span>';
    wrap.parentNode.insertBefore(toolbar, wrap);
    const input = toolbar.querySelector('input');
    const count = toolbar.querySelector('.table-count');

    const noResults = document.createElement('tr');
    noResults.className = 'no-results hidden';
    noResults.innerHTML = `<td colspan="${table.tHead ? table.tHead.rows[0].cells.length : 1}"><div class="empty"><h3>No matching records</h3><p>Try a different search term.</p></div></td>`;
    tbody.appendChild(noResults);

    const update = () => {
      const q = input.value.trim().toLowerCase();
      let shown = 0;
      rows.forEach((row) => {
        const match = !q || row.textContent.toLowerCase().includes(q);
        row.classList.toggle('hidden', !match);
        if (match) shown += 1;
      });
      noResults.classList.toggle('hidden', shown !== 0);
      count.textContent = q ? `${shown} of ${rows.length} records` : `${rows.length} ${rows.length === 1 ? 'record' : 'records'}`;
    };
    input.addEventListener('input', update);
    update();

    /* Sorting */
    const headers = table.tHead ? Array.from(table.tHead.rows[0].cells) : [];
    headers.forEach((th, index) => {
      if (!th.textContent.trim()) return;           // action column
      th.classList.add('sortable');
      th.tabIndex = 0;
      th.setAttribute('role', 'columnheader');
      th.setAttribute('aria-sort', 'none');
      const sort = () => {
        const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        headers.forEach((h) => h.setAttribute('aria-sort', 'none'));
        th.setAttribute('aria-sort', dir);
        const factor = dir === 'ascending' ? 1 : -1;
        const key = (row) => row.cells[index].dataset.sort ?? row.cells[index].textContent.trim();
        rows.sort((a, b) => factor * collator.compare(key(a), key(b)));
        rows.forEach((row) => tbody.insertBefore(row, noResults));
      };
      th.addEventListener('click', sort);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); } });
    });
  });
})();

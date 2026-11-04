let closeActiveDialog = null;

export function confirmAction(message, {
  title = 'Xác nhận thao tác',
  confirmLabel = 'Tiếp tục',
  cancelLabel = 'Hủy',
  danger = false,
} = {}) {
  if (typeof document === 'undefined' || typeof HTMLDialogElement === 'undefined') return Promise.resolve(false);
  closeActiveDialog?.(false);

  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'nasun-confirm-dialog';
    dialog.setAttribute('aria-labelledby', 'nasun-confirm-title');

    const heading = document.createElement('h2');
    heading.id = 'nasun-confirm-title';
    heading.textContent = title;
    const body = document.createElement('p');
    body.textContent = String(message ?? '');
    const actions = document.createElement('div');
    actions.className = 'nasun-confirm-dialog__actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = cancelLabel;
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    accept.textContent = confirmLabel;
    actions.append(cancel, accept);
    dialog.append(heading, body, actions);

    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (closeActiveDialog === finish) closeActiveDialog = null;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      resolve(value);
    };
    closeActiveDialog = finish;
    cancel.addEventListener('click', () => finish(false));
    accept.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) finish(false);
    });
    document.body.append(dialog);
    try {
      dialog.showModal();
      accept.focus();
    } catch {
      finish(false);
    }
  });
}

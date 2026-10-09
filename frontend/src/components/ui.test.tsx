import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Button, Modal } from './ui';
afterEach(cleanup);
function Example() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Associar imóvel</Button>
      <Button>Outro controle</Button>
      {open && (
        <Modal
          title="Associação do imóvel"
          onClose={() => setOpen(false)}
          footer={
            <Button onClick={() => setOpen(false)}>Salvar associação</Button>
          }
        >
          <label>
            Cliente
            <input name="client" />
          </label>
        </Modal>
      )}
    </>
  );
}
describe('modal keyboard interaction', () => {
  it('has an accessible name and traps forward/backward keyboard focus', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Associar imóvel' }));
    const dialog = screen.getByRole('dialog', { name: 'Associação do imóvel' });
    expect(dialog).toBeVisible();
    for (let count = 0; count < 5; count++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(
      within(dialog).getByRole('button', { name: 'Fechar diálogo' }),
    ).toBeVisible();
  });
  it('Escape closes and restores focus to the control that opened it', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Associar imóvel' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it('the close button closes and restores keyboard focus', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Associar imóvel' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Fechar diálogo' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConfirmModal, Field } from './ui';

describe('ConfirmModal', () => {
  it('renders nothing when closed', () => {
    const html = renderToString(
      <ConfirmModal open={false} title="Supprimer" message="Confirmer ?" onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(html).toBe('');
  });

  it('explains destructive actions before confirming', () => {
    const html = renderToString(
      <ConfirmModal open title="Suspendre" message="Le contrat sera suspendu." onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(html).toContain('Suspendre');
    expect(html).toContain('Le contrat sera suspendu.');
    expect(html).toContain('Annuler');
  });
});

describe('Field', () => {
  it('associates labels with their controls', () => {
    const html = renderToString(
      <Field label="Email">
        <input className="input" type="email" />
      </Field>,
    );
    const label = html.match(/<label[^>]*for="([^"]+)"[^>]*>Email<\/label>/);
    expect(label?.[1]).toBeTruthy();
    expect(html).toContain(`<input class="input" type="email" id="${label?.[1]}"`);
  });

  it('shows hints in a neutral style rather than as errors', () => {
    const html = renderToString(
      <Field label="Children" hint="Leave blank when there are none">
        <input className="input" />
      </Field>,
    );
    expect(html).toContain('Leave blank when there are none');
    expect(html).not.toContain('text-red-600');
  });
});

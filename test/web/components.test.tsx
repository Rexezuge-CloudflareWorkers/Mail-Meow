import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Notice from '~/components/shared/Notice';
import { LanguageSelector } from '~/components/shared/LanguageSelector';
import Header from '~/components/shared/Header';

describe('Notice', () => {
  it('renders nothing when there is no notice', () => {
    const { container } = render(<Notice notice={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces an error assertively so it interrupts', () => {
    // A plain div is announced by nothing, so errors were silently dropped for
    // screen-reader users.
    render(<Notice notice={{ type: 'error', text: 'Save Failed' }} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Save Failed');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveAttribute('aria-atomic', 'true');
  });

  it('announces a success politely without interrupting', () => {
    render(<Notice notice={{ type: 'success', text: 'Saved' }} />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Saved');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('offers a dismiss control when a handler is supplied', async () => {
    const onDismiss = vi.fn();
    render(<Notice notice={{ type: 'error', text: 'Boom' }} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('omits the dismiss control when no handler is supplied', () => {
    render(<Notice notice={{ type: 'success', text: 'Saved' }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('LanguageSelector', () => {
  it('exposes a single accessible name', () => {
    // Previously the control had both an sr-only <span> and an aria-label with
    // identical text, so its accessible name was announced twice.
    render(<LanguageSelector value="en" onChange={() => undefined} label="Language" />);

    const select = screen.getByRole('combobox', { name: 'Language' });
    expect(select).toBeInTheDocument();
    // Exactly one accessible name: the control carries an aria-label and renders
    // no wrapping <label> or sr-only duplicate.
    expect(select.getAttributeNames()).toContain('aria-label');
    expect(select.closest('label')).toBeNull();
    expect(select.querySelectorAll('.sr-only')).toHaveLength(0);
  });

  it('renders one option per supported language', async () => {
    const onChange = vi.fn();
    render(<LanguageSelector value="en" onChange={onChange} label="Language" />);

    const select = screen.getByRole('combobox');
    expect(select.querySelectorAll('option').length).toBeGreaterThan(1);

    await userEvent.selectOptions(select, 'de');
    expect(onChange).toHaveBeenCalledWith('de');
  });

  it('pins the control to an Unknown option when the language cannot be resolved', () => {
    render(<LanguageSelector value="unknown" onChange={() => undefined} label="Language" />);

    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
    expect(select).toHaveValue('unknown');
  });
});

describe('Header', () => {
  const user = { email: 'me@example.com', preferredLanguage: 'en', limits: {} } as never;

  it('exposes a toggle for the primary navigation', () => {
    render(<Header user={user} view="mailboxes" onViewChange={() => undefined} language="en" onLanguageChange={() => undefined} />);

    const toggle = screen.getByRole('button', { name: /menu/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'primary-nav');
  });

  it('marks the active view with aria-current, not colour alone', () => {
    render(<Header user={user} view="processing" onViewChange={() => undefined} language="en" onLanguageChange={() => undefined} />);

    expect(screen.getByRole('button', { current: 'page' })).toHaveTextContent('Processing');
  });

  it('reports the view change to the caller', async () => {
    const onViewChange = vi.fn();
    render(<Header user={user} view="mailboxes" onViewChange={onViewChange} language="en" onLanguageChange={() => undefined} />);

    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(onViewChange).toHaveBeenCalledWith('help');
  });

  it('does not nest a label around the language control', () => {
    const { container } = render(
      <Header user={user} view="mailboxes" onViewChange={() => undefined} language="en" onLanguageChange={() => undefined} />,
    );

    // A <label> wrapping a control that already has an accessible name produced
    // nested labels, which is invalid HTML.
    expect(container.querySelector('label')).toBeNull();
  });
});

// @vitest-environment jsdom
import React from 'react';
import { afterEach, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TransactionsTable } from './ui';
import { money, type Transfer } from '../lib/api';
afterEach(cleanup);
const transfer: Transfer = {
  id: 'a',
  sender_id: 'sender',
  recipient_id: 'recipient',
  sender_name: 'Rahul',
  recipient_name: 'Priya',
  amount: '50000',
  note: 'Lunch',
  reference: 'SC-TEST',
  status: 'COMPLETED',
  failure_reason: null,
  created_at: '2026-10-27T12:00:00Z',
  updated_at: '2026-10-27T12:00:00Z',
  journal_id: 'journal',
};
it('shows outgoing and incoming direction accurately for the participant', () => {
  const view = render(
    <MemoryRouter>
      <TransactionsTable items={[transfer]} userId="sender" />
    </MemoryRouter>,
  );
  expect(screen.getByText('−₹500.00')).toBeTruthy();
  expect(screen.getByText('Priya')).toBeTruthy();
  view.rerender(
    <MemoryRouter>
      <TransactionsTable items={[transfer]} userId="recipient" />
    </MemoryRouter>,
  );
  expect(screen.getByText('+₹500.00')).toBeTruthy();
  expect(screen.getByText('Rahul')).toBeTruthy();
});
it('shows an honest empty state without invented transfers', () => {
  render(
    <MemoryRouter>
      <TransactionsTable items={[]} />
    </MemoryRouter>,
  );
  expect(screen.getByText('No transactions yet')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});
it('formats paise exactly above Number.MAX_SAFE_INTEGER', () => {
  expect(money('900719925474099129')).toBe('₹9,00,71,99,25,47,40,991.29');
});
it('renders a separate reversal with the correct direction and detail link for both participants', () => {
  const reversal: Transfer = {
    ...transfer,
    id: 'reversal',
    history_id: 'REVERSAL:reversal',
    type: 'REVERSAL',
    transfer_id: transfer.id,
    original_reference: transfer.reference,
    reference: 'reverse-a',
    sender_id: 'recipient',
    recipient_id: 'sender',
    sender_name: 'Priya',
    recipient_name: 'Rahul',
  };
  const view = render(
    <MemoryRouter>
      <TransactionsTable items={[reversal, transfer]} userId="sender" />
    </MemoryRouter>,
  );
  expect(screen.getByText(/Reversal received/)).toBeTruthy();
  expect(screen.getByText('+₹500.00')).toBeTruthy();
  expect(screen.getByText('−₹500.00')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'View reverse-a' }).getAttribute('href')).toBe(
    '/app/reversals/reversal',
  );
  view.rerender(
    <MemoryRouter>
      <TransactionsTable items={[reversal, transfer]} userId="recipient" />
    </MemoryRouter>,
  );
  expect(screen.getByText(/Reversal sent/)).toBeTruthy();
  expect(screen.getAllByRole('row')).toHaveLength(3);
});

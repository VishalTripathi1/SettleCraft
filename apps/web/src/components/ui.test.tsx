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

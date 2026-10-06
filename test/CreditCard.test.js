'use strict';

const test = require('node:test');
const assert = require('node:assert');
const CreditCard = require('../models/CreditCard');

const NOW = new Date('2026-10-06T00:00:00Z');
const base = {
  cardNumber: '4111 1111 1111 1111',
  cardholderName: 'Jane Doe',
  expiryMonth: 12,
  expiryYear: 2028,
  cvv: '123',
};

test('valid Visa card', () => {
  const card = new CreditCard(base);
  assert.strictEqual(card.brand, 'visa');
  assert.deepStrictEqual(card.validate(NOW), { valid: true, errors: {} });
});

test('detects brands', () => {
  assert.strictEqual(CreditCard.detectBrand('5555555555554444'), 'mastercard');
  assert.strictEqual(CreditCard.detectBrand('2223003122003222'), 'mastercard');
  assert.strictEqual(CreditCard.detectBrand('378282246310005'), 'amex');
  assert.strictEqual(CreditCard.detectBrand('6011111111111117'), 'discover');
  assert.strictEqual(CreditCard.detectBrand('3530111333300000'), 'jcb');
  assert.strictEqual(CreditCard.detectBrand('9999999999999999'), 'unknown');
});

test('rejects bad checksum', () => {
  const card = new CreditCard({ ...base, cardNumber: '4111111111111112' });
  assert.strictEqual(card.validate(NOW).errors.cardNumber, 'Card number failed checksum');
});

test('expiry is inclusive of the expiry month', () => {
  const card = new CreditCard({ ...base, expiryMonth: 10, expiryYear: 26 });
  assert.strictEqual(card.expiryYear, 2026);
  assert.strictEqual(card.isExpired(new Date(2026, 9, 31)), false);
  assert.strictEqual(card.isExpired(new Date(2026, 10, 1)), true);
});

test('Amex requires 4-digit CVV and masks in 4-6-5 groups', () => {
  const card = new CreditCard({ ...base, cardNumber: '378282246310005', cvv: '123' });
  assert.ok(card.validate(NOW).errors.cvv);
  assert.strictEqual(card.maskedNumber, '**** ****** *0005');
});

test('serialisation never exposes full number or CVV', () => {
  const card = new CreditCard(base);
  const json = JSON.stringify(card);
  assert.ok(!json.includes('4111111111111111'));
  assert.ok(!json.includes('123'));
  assert.strictEqual(JSON.parse(json).maskedNumber, '**** **** **** 1111');
  assert.strictEqual(card.cvv, '123');
});

test('reports missing fields', () => {
  const { valid, errors } = new CreditCard({}).validate(NOW);
  assert.strictEqual(valid, false);
  assert.ok(errors.cardNumber && errors.cardholderName && errors.expiryMonth && errors.expiryYear);
});

// tests/payoff.test.js
// Tests for simulatePayoff. Run them with: npm test
//
// The expected answers come from outside the code under test:
//   - a case worked by hand, cent by cent,
//   - the standard amortization formula,
//   - rules (invariants) that must hold for any input.

import { test } from "node:test";
import assert from "node:assert/strict";
import { simulatePayoff } from "../payoff.js";

// ---- Shared test data ----

// Three cards with different APRs and balances. The smallest balance has the
// lowest APR, so avalanche and snowball pick different cards to pay first.
const threeCards = [
  { name: "Store card", balanceCents: 60000, aprBps: 1200, minPaymentCents: 2500 },
  { name: "Travel card", balanceCents: 400000, aprBps: 2799, minPaymentCents: 8000 },
  { name: "Gas card", balanceCents: 150000, aprBps: 2000, minPaymentCents: 3500 },
];
const threeCardsBudget = 30000; // $300 a month

// ---- Small helpers ----

// Adds up a list of numbers.
function sum(numbers) {
  let total = 0;
  for (const n of numbers) {
    total += n;
  }
  return total;
}

// Names of the cards that got more than their minimum in a schedule row,
// meaning they received extra money that month.
function cardsGettingExtra(row, cards) {
  const names = [];
  for (let i = 0; i < cards.length; i++) {
    if (row.cards[i].paymentCents > cards[i].minPaymentCents) {
      names.push(cards[i].name);
    }
  }
  return names;
}

// ---- Tests ----

test("hand case: $1,000 at 18% with $100 a month matches the first two months worked by hand", () => {
  const result = simulatePayoff({
    cards: [{ name: "Card", balanceCents: 100000, aprBps: 1800, minPaymentCents: 10000 }],
    budgetCents: 10000,
    strategy: "avalanche",
  });

  assert.equal(result.ok, true);

  // Month 1: 100000 * 18% / 12 = 1500 interest; 100000 + 1500 - 10000 = 91500.
  const month1 = result.schedule[0];
  assert.equal(month1.month, 1);
  assert.equal(month1.cards[0].interestCents, 1500);
  assert.equal(month1.cards[0].endBalanceCents, 91500);

  // Month 2: 91500 * 18% / 12 = 1372.5, rounded half up to 1373;
  // 91500 + 1373 - 10000 = 82873.
  const month2 = result.schedule[1];
  assert.equal(month2.month, 2);
  assert.equal(month2.cards[0].interestCents, 1373);
  assert.equal(month2.cards[0].endBalanceCents, 82873);
});

test("amortization formula: $5,000 at 20% with $300 a month pays off in month ceil(n)", () => {
  const balanceCents = 500000;
  const aprBps = 2000;
  const paymentCents = 30000;

  const result = simulatePayoff({
    cards: [{ name: "Card", balanceCents: balanceCents, aprBps: aprBps, minPaymentCents: 10000 }],
    budgetCents: paymentCents,
    strategy: "avalanche",
  });

  // Number of months n to pay off balance B with a fixed payment P at monthly rate r:
  //   n = -ln(1 - r * B / P) / ln(1 + r)
  // Here r = 20% / 12 = 0.016666..., so n is about 19.7: the loan ends in month 20.
  const r = aprBps / 10000 / 12;
  const n = -Math.log(1 - (r * balanceCents) / paymentCents) / Math.log(1 + r);

  assert.equal(result.ok, true);
  assert.equal(result.months, Math.ceil(n));
});

test("invariants hold on three cards for both avalanche and snowball", () => {
  const startingTotalCents = sum(threeCards.map((card) => card.balanceCents));

  for (const strategy of ["avalanche", "snowball"]) {
    const result = simulatePayoff({ cards: threeCards, budgetCents: threeCardsBudget, strategy: strategy });
    assert.equal(result.ok, true, strategy);

    // Every dollar paid is either original debt or interest.
    assert.equal(result.totalPaidCents, startingTotalCents + result.totalInterestCents, strategy);

    // Totals are whole cents.
    assert.ok(Number.isInteger(result.months), strategy);
    assert.ok(Number.isInteger(result.totalInterestCents), strategy);
    assert.ok(Number.isInteger(result.totalPaidCents), strategy);

    // Every card has a payoff month between 1 and the last month,
    // and the last card is paid off in the last month.
    // (Math.max(...list) passes each item of the list to Math.max as its own argument.)
    for (const payoffMonth of result.payoffMonthByCard) {
      assert.ok(Number.isInteger(payoffMonth), strategy);
      assert.ok(payoffMonth >= 1 && payoffMonth <= result.months, strategy);
    }
    assert.equal(Math.max(...result.payoffMonthByCard), result.months, strategy);

    // One schedule row per month, numbered from 1.
    assert.equal(result.schedule.length, result.months, strategy);

    for (const row of result.schedule) {
      let paidThisMonth = 0;
      for (const card of row.cards) {
        // All values are whole cents.
        assert.ok(Number.isInteger(card.interestCents), strategy);
        assert.ok(Number.isInteger(card.paymentCents), strategy);
        assert.ok(Number.isInteger(card.endBalanceCents), strategy);
        // No balance ever goes negative.
        assert.ok(card.endBalanceCents >= 0, `${strategy} month ${row.month}: ${card.name}`);
        paidThisMonth += card.paymentCents;
      }
      // Never spend more than the budget in a month.
      assert.ok(paidThisMonth <= threeCardsBudget, `${strategy} month ${row.month}`);
    }
  }
});

test("avalanche pays no more interest than snowball, and they target different cards first", () => {
  const avalanche = simulatePayoff({ cards: threeCards, budgetCents: threeCardsBudget, strategy: "avalanche" });
  const snowball = simulatePayoff({ cards: threeCards, budgetCents: threeCardsBudget, strategy: "snowball" });

  assert.equal(avalanche.ok, true);
  assert.equal(snowball.ok, true);
  assert.ok(avalanche.totalInterestCents <= snowball.totalInterestCents);

  // In month 1, avalanche puts the extra on the highest APR (Travel card, 27.99%),
  // and snowball puts it on the smallest balance (Store card, $600).
  assert.deepEqual(cardsGettingExtra(avalanche.schedule[0], threeCards), ["Travel card"]);
  assert.deepEqual(cardsGettingExtra(snowball.schedule[0], threeCards), ["Store card"]);

  // Snowball's whole point: the smallest card disappears first.
  const storeCardPosition = 0;
  const firstSnowballPayoff = Math.min(...snowball.payoffMonthByCard);
  assert.equal(snowball.payoffMonthByCard[storeCardPosition], firstSnowballPayoff);
});

test("0% APR: $1,200 with $100 a month takes exactly 12 months and no interest", () => {
  const balanceCents = 120000;
  const budgetCents = 10000;

  const result = simulatePayoff({
    cards: [{ name: "Card", balanceCents: balanceCents, aprBps: 0, minPaymentCents: 2500 }],
    budgetCents: budgetCents,
    strategy: "avalanche",
  });

  assert.equal(result.ok, true);
  assert.equal(result.months, balanceCents / budgetCents); // 12
  assert.equal(result.totalInterestCents, 0);
  assert.equal(result.totalPaidCents, balanceCents);
});

test("a budget smaller than the sum of the minimums is rejected", () => {
  const cards = [
    { name: "Card A", balanceCents: 100000, aprBps: 1500, minPaymentCents: 5000 },
    { name: "Card B", balanceCents: 200000, aprBps: 2000, minPaymentCents: 5000 },
  ];
  const oneCentShort = 5000 + 5000 - 1;

  const result = simulatePayoff({ cards: cards, budgetCents: oneCentShort, strategy: "snowball" });

  assert.deepEqual(result, { ok: false, reason: "budget-below-minimums" });
});

test("a budget smaller than the monthly interest never pays off", () => {
  // $10,000 at 30% grows by about $250 a month, more than the $200 budget.
  const result = simulatePayoff({
    cards: [{ name: "Card", balanceCents: 1000000, aprBps: 3000, minPaymentCents: 20000 }],
    budgetCents: 20000,
    strategy: "avalanche",
  });

  assert.deepEqual(result, { ok: false, reason: "never-pays-off" });
});

test("final month pays exactly what is left, not the full budget", () => {
  // $250 at 12% with $100 a month: the last payment is smaller than $100.
  const budgetCents = 10000;
  const result = simulatePayoff({
    cards: [{ name: "Card", balanceCents: 25000, aprBps: 1200, minPaymentCents: 2500 }],
    budgetCents: budgetCents,
    strategy: "avalanche",
  });

  assert.equal(result.ok, true);

  const lastRow = result.schedule[result.schedule.length - 1];
  const rowBefore = result.schedule[result.schedule.length - 2];
  const owedInLastMonth = rowBefore.cards[0].endBalanceCents + lastRow.cards[0].interestCents;

  assert.equal(lastRow.cards[0].paymentCents, owedInLastMonth);
  assert.ok(lastRow.cards[0].paymentCents < budgetCents);
  assert.equal(lastRow.cards[0].endBalanceCents, 0);
});

test("bad input throws a clear error", () => {
  const goodCard = { name: "Card", balanceCents: 100000, aprBps: 1800, minPaymentCents: 10000 };
  // { ...goodCard, balanceCents: -5 } means: a copy of goodCard with one field changed.

  assert.throws(
    () => simulatePayoff({ cards: [goodCard], budgetCents: 10000, strategy: "fastest" }),
    /strategy must be "avalanche" or "snowball"/
  );
  assert.throws(
    () => simulatePayoff({ cards: [{ ...goodCard, balanceCents: -5 }], budgetCents: 10000, strategy: "snowball" }),
    /balanceCents must be a whole number/
  );
  assert.throws(
    () => simulatePayoff({ cards: [{ ...goodCard, aprBps: 18.5 }], budgetCents: 10000, strategy: "snowball" }),
    /aprBps must be a whole number/
  );
  assert.throws(
    () => simulatePayoff({ cards: [goodCard], budgetCents: 99.99, strategy: "snowball" }),
    /budgetCents must be a whole number/
  );
});

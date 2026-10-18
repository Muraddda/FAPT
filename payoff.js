// payoff.js
// Credit card payoff engine for FAPT.
//
// simulatePayoff is a "pure function": data goes in, an answer comes out,
// and it never reads or changes the page. That is why the browser page and
// the tests can both load this exact same file.
//
// Units used everywhere in this file:
//   - Money is whole cents (integers). $5,000.00 is stored as 500000.
//   - APR is whole basis points (integers). 18% is stored as 1800.

// Give up after 600 months (50 years) and report "never-pays-off".
const MAX_MONTHS = 600;

// To turn a yearly rate in basis points into a monthly fraction we divide by
// 10000 (basis points per 100%) and by 12 (months per year): 10000 * 12.
const BPS_PER_YEAR_TO_MONTHLY = 120000;

export function simulatePayoff({ cards, budgetCents, strategy }) {
  // ---- 1. Check the input ----
  if (!Array.isArray(cards)) {
    throw new Error("cards must be an array");
  }
  checkWholeNumber(budgetCents, "budgetCents");
  if (strategy !== "avalanche" && strategy !== "snowball") {
    throw new Error(`strategy must be "avalanche" or "snowball", got "${strategy}"`);
  }
  for (const card of cards) {
    checkWholeNumber(card.balanceCents, `${card.name}: balanceCents`);
    checkWholeNumber(card.aprBps, `${card.name}: aprBps`);
    checkWholeNumber(card.minPaymentCents, `${card.name}: minPaymentCents`);
  }

  // ---- 2. The budget must cover the minimum of every card that has a balance ----
  let totalMinimumsCents = 0;
  for (const card of cards) {
    if (card.balanceCents > 0) {
      totalMinimumsCents += card.minPaymentCents;
    }
  }
  if (budgetCents < totalMinimumsCents) {
    return { ok: false, reason: "budget-below-minimums" };
  }

  // ---- 3. Set up ----
  // The order in which cards receive extra money (a list of card positions).
  const order = targetOrder(cards, strategy);

  // Our own copy of the balances, so we never change the caller's data.
  const balances = cards.map((card) => card.balanceCents);

  // The month each card reaches 0. A card that starts at 0 is "paid off" in month 0.
  // null means "not paid off yet".
  const payoffMonthByCard = cards.map((card) => (card.balanceCents === 0 ? 0 : null));

  let totalInterestCents = 0;
  let totalPaidCents = 0;
  const schedule = [];
  let month = 0;

  // ---- 4. Simulate one month at a time ----
  while (hasBalanceLeft(balances) && month < MAX_MONTHS) {
    month += 1;

    // What happened to each card this month, by card position.
    const interestThisMonth = cards.map(() => 0);
    const paymentThisMonth = cards.map(() => 0);

    // Step 1: add one month of interest to every card that still owes money.
    // Math.round rounds half up for positive numbers (1372.5 -> 1373).
    for (let i = 0; i < cards.length; i++) {
      if (balances[i] > 0) {
        const interest = Math.round((balances[i] * cards[i].aprBps) / BPS_PER_YEAR_TO_MONTHLY);
        interestThisMonth[i] = interest;
        balances[i] += interest;
      }
    }

    // Step 2: pay the minimum on every card, but never more than it owes.
    let budgetLeft = budgetCents;
    for (let i = 0; i < cards.length; i++) {
      const payment = Math.min(cards[i].minPaymentCents, balances[i]);
      paymentThisMonth[i] += payment;
      balances[i] -= payment;
      budgetLeft -= payment;
    }

    // Step 3: put whatever budget is left on the target card, never more than
    // it owes. Leftover moves on to the next card in the order, same month.
    // Minimums no longer needed by paid-off cards are part of budgetLeft,
    // so they automatically become extra money here.
    for (const i of order) {
      const payment = Math.min(budgetLeft, balances[i]);
      paymentThisMonth[i] += payment;
      balances[i] -= payment;
      budgetLeft -= payment;
    }

    // Note the month each card first reaches 0.
    for (let i = 0; i < cards.length; i++) {
      if (balances[i] === 0 && payoffMonthByCard[i] === null) {
        payoffMonthByCard[i] = month;
      }
    }

    // Step 4: add to the running totals and record this month's schedule row.
    const cardRows = [];
    for (let i = 0; i < cards.length; i++) {
      totalInterestCents += interestThisMonth[i];
      totalPaidCents += paymentThisMonth[i];
      cardRows.push({
        name: cards[i].name,
        interestCents: interestThisMonth[i],
        paymentCents: paymentThisMonth[i],
        endBalanceCents: balances[i],
      });
    }
    schedule.push({ month: month, cards: cardRows });
  }

  // ---- 5. Report the result ----
  // Step 5 of the monthly rules: the loop stops when everything is paid,
  // or at the 600-month cap. If money is still owed, it never pays off.
  if (hasBalanceLeft(balances)) {
    return { ok: false, reason: "never-pays-off" };
  }

  return {
    ok: true,
    months: month,
    totalInterestCents: totalInterestCents,
    totalPaidCents: totalPaidCents,
    payoffMonthByCard: payoffMonthByCard,
    schedule: schedule,
  };
}

// Returns card positions in the order they should receive extra money.
//   avalanche: highest APR first (saves the most interest).
//   snowball:  smallest starting balance first (cards disappear sooner).
// Ties keep the order the cards were given in.
// The order is decided once, at the start, from the starting balances.
function targetOrder(cards, strategy) {
  const positions = cards.map((card, i) => i);
  positions.sort((a, b) => {
    let difference;
    if (strategy === "avalanche") {
      difference = cards[b].aprBps - cards[a].aprBps; // bigger APR goes first
    } else {
      difference = cards[a].balanceCents - cards[b].balanceCents; // smaller balance goes first
    }
    if (difference !== 0) {
      return difference;
    }
    return a - b; // tie: earlier card in the input goes first
  });
  return positions;
}

// True if any card still owes money.
function hasBalanceLeft(balances) {
  for (const balance of balances) {
    if (balance > 0) {
      return true;
    }
  }
  return false;
}

// Throws a clear error unless value is a whole number that is 0 or more.
function checkWholeNumber(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole number of 0 or more, got ${value}`);
  }
}

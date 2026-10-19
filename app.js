// app.js
// Connects the credit card payoff page to payoff.js and parse.js.
// The page loads this file as a module, so it runs after the HTML is parsed.

import { simulatePayoff } from "./payoff.js";
import { parseDollarsToCents, parsePercentToBps } from "./parse.js";

const AVALANCHE = {
  key: "avalanche",
  title: "Avalanche",
  description: "Pays the highest APR first.",
};

const SNOWBALL = {
  key: "snowball",
  title: "Snowball",
  description: "Pays the smallest starting balance first.",
};

function start() {
  document.getElementById("add-card").addEventListener("click", addCard);
  document.getElementById("calculate").addEventListener("click", calculate);

  const rows = document.querySelectorAll("#card-list > .card-row");
  for (const row of rows) {
    wireRemoveButton(row);
  }
}

// The first card row is written in the HTML as card number 1.
let nextCardNumber = 2;

function addCard() {
  document.getElementById("card-list").appendChild(createCardRow());
}

function createCardRow() {
  const rowNumber = nextCardNumber;
  nextCardNumber = nextCardNumber + 1;

  const row = document.createElement("div");
  row.className = "card-row";
  row.appendChild(createField("Card Name", "card-name", false, "card-name-" + rowNumber));
  row.appendChild(createField("Balance ($)", "card-balance", true, "card-balance-" + rowNumber));
  row.appendChild(createField("APR (%)", "card-apr", true, "card-apr-" + rowNumber));
  row.appendChild(createField("Minimum Payment ($)", "card-min-payment", true, "card-min-payment-" + rowNumber));

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "remove-card";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", function () {
    removeCard(removeButton);
  });
  row.appendChild(removeButton);
  return row;
}

// decimal is true for money and APR fields, so phones show a number keyboard.
function createField(labelText, className, decimal, inputId) {
  const field = document.createElement("div");
  field.className = "field";

  const label = document.createElement("label");
  label.htmlFor = inputId;
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "text";
  input.id = inputId;
  input.placeholder = labelText;
  input.className = className;
  if (decimal) {
    input.inputMode = "decimal";
  }

  const error = document.createElement("p");
  error.className = "field-error";
  error.id = inputId + "-error";

  field.appendChild(label);
  field.appendChild(input);
  field.appendChild(error);
  return field;
}

function wireRemoveButton(row) {
  const button = row.querySelector(".remove-card");
  button.addEventListener("click", function () {
    removeCard(button);
  });
}

function removeCard(button) {
  const rows = document.querySelectorAll("#card-list > .card-row");
  // Leave one row so the page always has a place to type a card.
  if (rows.length <= 1) {
    return;
  }
  button.parentElement.remove();
}

function calculate() {
  clearErrors();

  const cardRead = readCards();
  const budgetRead = readBudget();
  if (!cardRead.ok || !budgetRead.ok) {
    hideResults();
    return;
  }

  // simulatePayoff copies the balances, so both calls can share this list.
  const cards = cardRead.cards;
  const budgetCents = budgetRead.budgetCents;
  const avalanche = simulatePayoff({
    cards: cards,
    budgetCents: budgetCents,
    strategy: AVALANCHE.key,
  });
  const snowball = simulatePayoff({
    cards: cards,
    budgetCents: budgetCents,
    strategy: SNOWBALL.key,
  });

  showResults(cards, avalanche, snowball);
}

function clearErrors() {
  const errors = document.querySelectorAll(".field-error");
  for (const error of errors) {
    error.textContent = "";
  }

  const inputs = document.querySelectorAll("#card-list input, #monthly-budget");
  for (const input of inputs) {
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  }
}

function showFieldError(input, message) {
  const error = input.parentElement.querySelector(".field-error");
  error.textContent = message;
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-describedby", error.id);
}

function readCards() {
  const rows = document.querySelectorAll("#card-list > .card-row");
  const cards = [];
  let valid = true;

  for (const row of rows) {
    // A row the user has not started is not a card.
    if (rowIsBlank(row)) {
      continue;
    }

    const nameInput = row.querySelector(".card-name");
    const balanceInput = row.querySelector(".card-balance");
    const aprInput = row.querySelector(".card-apr");
    const minInput = row.querySelector(".card-min-payment");

    const balance = parseDollarsToCents(balanceInput.value);
    const apr = parsePercentToBps(aprInput.value);
    const minimum = parseDollarsToCents(minInput.value);

    if (!balance.ok) {
      showFieldError(balanceInput, balance.message);
      valid = false;
    }
    if (!apr.ok) {
      showFieldError(aprInput, apr.message);
      valid = false;
    }
    if (!minimum.ok) {
      showFieldError(minInput, minimum.message);
      valid = false;
    }

    if (balance.ok && apr.ok && minimum.ok) {
      cards.push({
        name: nameInput.value.trim(),
        balanceCents: balance.value,
        aprBps: apr.value,
        minPaymentCents: minimum.value,
      });
    }
  }

  if (valid && cards.length === 0) {
    document.getElementById("cards-error").textContent = "Add at least one card.";
    return { ok: false };
  }
  if (!valid) {
    return { ok: false };
  }

  for (let i = 0; i < cards.length; i++) {
    if (cards[i].name === "") {
      cards[i].name = "Card " + (i + 1);
    }
  }
  return { ok: true, cards: cards };
}

function rowIsBlank(row) {
  const inputs = row.querySelectorAll("input");
  for (const input of inputs) {
    if (input.value.trim() !== "") {
      return false;
    }
  }
  return true;
}

function readBudget() {
  const input = document.getElementById("monthly-budget");
  const parsed = parseDollarsToCents(input.value);
  if (!parsed.ok) {
    showFieldError(input, parsed.message);
    return { ok: false };
  }
  return { ok: true, budgetCents: parsed.value };
}

function hideResults() {
  document.getElementById("payoff-summary").classList.remove("active");
  document.getElementById("payoff-details").textContent = "Payoff summary will appear here.";
}

function showResults(cards, avalanche, snowball) {
  const details = document.getElementById("payoff-details");
  details.textContent = "";
  details.appendChild(cardNamesLine(cards));

  // Both strategies failed for the same reason, so one sentence is enough.
  const sameFailure = !avalanche.ok && !snowball.ok && avalanche.reason === snowball.reason;
  if (sameFailure) {
    const message = textLine(reasonText(avalanche.reason));
    message.className = "payoff-message";
    details.appendChild(message);
  } else {
    const cheaper = cheaperKey(avalanche, snowball);
    const compare = document.createElement("div");
    compare.className = "strategy-compare";
    compare.appendChild(strategyBlock(AVALANCHE, avalanche, cheaper === AVALANCHE.key));
    compare.appendChild(strategyBlock(SNOWBALL, snowball, cheaper === SNOWBALL.key));
    details.appendChild(compare);

    if (avalanche.ok && snowball.ok) {
      details.appendChild(savingsLine(avalanche, snowball));
    }
    if (avalanche.ok || snowball.ok) {
      details.appendChild(estimateNote());
    }
  }

  const summary = document.getElementById("payoff-summary");
  summary.classList.add("active");
  summary.scrollIntoView({ block: "nearest" });
}

function cardNamesLine(cards) {
  const names = [];
  for (const card of cards) {
    names.push(card.name);
  }
  const line = document.createElement("p");
  line.className = "card-names";
  // The name is whatever the user typed, so keep it as text.
  line.textContent = "Cards: " + names.join(", ");
  return line;
}

function strategyBlock(strategy, result, highlight) {
  const block = document.createElement("div");
  block.className = "strategy-result";
  if (highlight) {
    block.classList.add("is-cheaper");
  }

  const heading = document.createElement("h3");
  heading.textContent = strategy.title;
  block.appendChild(heading);

  const description = document.createElement("p");
  description.className = "strategy-description";
  description.textContent = strategy.description;
  block.appendChild(description);

  if (!result.ok) {
    block.appendChild(textLine(reasonText(result.reason)));
    return block;
  }

  block.appendChild(textLine("Months to payoff: " + result.months));
  block.appendChild(textLine("Total interest: " + formatDollars(result.totalInterestCents)));
  block.appendChild(textLine("Total paid: " + formatDollars(result.totalPaidCents)));
  block.appendChild(scheduleDetails(result.schedule));
  return block;
}

function scheduleDetails(schedule) {
  const details = document.createElement("details");
  details.className = "schedule";

  const summary = document.createElement("summary");
  summary.textContent = "Show monthly schedule";
  details.appendChild(summary);

  const scroller = document.createElement("div");
  scroller.className = "schedule-scroll";
  scroller.appendChild(scheduleTable(schedule));
  details.appendChild(scroller);
  return details;
}

function scheduleTable(schedule) {
  const table = document.createElement("table");
  if (schedule.length === 0) {
    return table;
  }

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(headerCell("Month"));
  for (const card of schedule[0].cards) {
    headRow.appendChild(headerCell(card.name + " payment"));
    headRow.appendChild(headerCell(card.name + " interest"));
    headRow.appendChild(headerCell(card.name + " end balance"));
  }
  head.appendChild(headRow);
  table.appendChild(head);

  const body = document.createElement("tbody");
  for (const monthRow of schedule) {
    const row = document.createElement("tr");
    row.appendChild(bodyCell(String(monthRow.month)));
    for (const card of monthRow.cards) {
      row.appendChild(bodyCell(formatDollars(card.paymentCents)));
      row.appendChild(bodyCell(formatDollars(card.interestCents)));
      row.appendChild(bodyCell(formatDollars(card.endBalanceCents)));
    }
    body.appendChild(row);
  }
  table.appendChild(body);
  return table;
}

function headerCell(text) {
  const cell = document.createElement("th");
  cell.scope = "col";
  cell.textContent = text;
  return cell;
}

function bodyCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function textLine(text) {
  const line = document.createElement("p");
  line.textContent = text;
  return line;
}

function cheaperKey(avalanche, snowball) {
  if (!avalanche.ok || !snowball.ok) {
    return "";
  }
  if (avalanche.totalInterestCents < snowball.totalInterestCents) {
    return AVALANCHE.key;
  }
  if (snowball.totalInterestCents < avalanche.totalInterestCents) {
    return SNOWBALL.key;
  }
  return "";
}

function savingsLine(avalanche, snowball) {
  const line = document.createElement("p");
  line.className = "savings-line";

  if (avalanche.totalInterestCents === snowball.totalInterestCents) {
    line.textContent = "Same cost either way";
    return line;
  }

  let winner = SNOWBALL.title;
  let savedCents = avalanche.totalInterestCents - snowball.totalInterestCents;
  if (avalanche.totalInterestCents < snowball.totalInterestCents) {
    winner = AVALANCHE.title;
    savedCents = snowball.totalInterestCents - avalanche.totalInterestCents;
  }
  line.textContent = winner + " saves " + formatDollars(savedCents) + " in interest.";
  return line;
}

function estimateNote() {
  const note = document.createElement("p");
  note.className = "estimate-note";
  note.textContent =
    "Real card issuers charge interest on the average daily balance, so these results are close estimates.";
  return note;
}

function reasonText(reason) {
  if (reason === "budget-below-minimums") {
    return "The monthly budget doesn't cover all minimum payments.";
  }
  if (reason === "never-pays-off") {
    return "The balance never reaches $0 within 50 years at this budget.";
  }
  return "The payoff could not be calculated.";
}

// Build "$1,767.25" from whole cents. Dividing by 100 first would use
// floating point, which cannot store every cent exactly.
function formatDollars(cents) {
  const dollars = Math.floor(cents / 100);
  const leftover = cents % 100;
  return "$" + withCommas(dollars) + "." + String(leftover).padStart(2, "0");
}

function withCommas(dollars) {
  const digits = String(dollars);
  let result = "";
  let placed = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    if (placed === 3) {
      result = "," + result;
      placed = 0;
    }
    result = digits[i] + result;
    placed = placed + 1;
  }
  return result;
}

start();

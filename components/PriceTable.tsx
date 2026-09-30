import type { PriceBook } from "@/lib/pricing";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/types";

const COLUMNS: Currency[] = ["USD", "GBP", "EUR", "AED", "EGP"];

export function PriceTable({ book }: { book: PriceBook }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Plan</th>
            {COLUMNS.map((currency) => (
              <th key={currency}>{currency}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {book.plans.map((plan) => (
            <tr key={plan.id}>
              <td>
                <strong>{plan.name}</strong>
                <div className="muted">{plan.detail}</div>
              </td>
              {COLUMNS.map((currency) => {
                const amount = plan.prices[currency];
                return <td key={currency}>{amount == null ? "Unavailable" : formatMoney(amount, currency)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        {book.egp.formula}
        {book.egp.rate != null
          ? ` 1 USD = ${book.egp.rate} EGP on ${book.egp.date}.`
          : ` ${book.egp.error ?? "The daily rate is unavailable."}`}
        {" "}GBP, EUR, and AED stay on the list. AED uses the 3.6725 dirham peg.
      </p>
    </div>
  );
}

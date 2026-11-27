import { getMe } from '@/lib/session';
import { getMyClipper, LANGUAGES, NICHES } from '@/lib/crew';
import { saveProfile } from '../actions';
import { Flash, type SP } from '../../ui';

export default async function Profile({ searchParams }: { searchParams: SP }) {
  const { ok, err } = await searchParams;
  const me = (await getMe())!;
  const c = await getMyClipper(me.id);

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h1>Profile and payments</h1>
      <Flash ok={ok} err={err} />
      <form action={saveProfile} className="stack">
        <div>
          <label htmlFor="city">City</label>
          <input id="city" name="city" defaultValue={c?.city ?? ''} required />
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="muted" style={{ marginBottom: 6 }}>Niches you clip best</legend>
          <div className="checks">
            {NICHES.map((n) => (
              <label key={n}><input type="checkbox" name="niches" value={n} defaultChecked={c?.niches.includes(n)} />{n}</label>
            ))}
          </div>
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="muted" style={{ marginBottom: 6 }}>Languages you edit in</legend>
          <div className="checks">
            {LANGUAGES.map((l) => (
              <label key={l}><input type="checkbox" name="languages" value={l} defaultChecked={c?.languages.includes(l)} />{l}</label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="pan">PAN {c?.pan_last4 && <span>(saved: {c.pan_last4}. Leave blank to keep it)</span>}</label>
          <input id="pan" name="pan" autoComplete="off" placeholder="ABCDE1234F" maxLength={10} style={{ textTransform: 'uppercase' }} />
        </div>
        <div>
          <label htmlFor="upi">UPI ID {c?.upi_masked && <span>(saved: {c.upi_masked}. Leave blank to keep it)</span>}</label>
          <input id="upi" name="upi" autoComplete="off" placeholder="yourname@bank" />
        </div>
        <p className="muted">Your PAN and UPI ID are encrypted and only used to pay you. The name on your UPI must match your PAN. Changing either one means we check it again before your next payout.</p>
        <button className="primary" type="submit">Save profile</button>
      </form>
    </div>
  );
}

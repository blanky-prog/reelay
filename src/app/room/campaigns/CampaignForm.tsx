// Shared fields for creating and editing a campaign. Money is entered in rupees.
const r = (p?: number | null) => (p == null ? '' : String(p / 100));

export function CampaignFields({ c, orgs }: { c?: any; orgs: { id: string; name: string }[] }) {
  const tiers: string[] = c?.allowed_tiers ?? ['rookie', 'runner', 'anchor'];
  return (
    <>
      <div className="grid">
        <div><label htmlFor="name">Campaign name</label><input id="name" name="name" defaultValue={c?.name ?? ''} required /></div>
        <div><label htmlFor="org">Client</label>
          <select id="org" name="organisation_id" defaultValue={c?.organisation_id ?? ''} required>
            <option value="" disabled>Pick a client</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div><label htmlFor="package">Package</label>
          <select id="package" name="package" defaultValue={c?.package ?? 'relay'}>
            <option value="first_leg">First Leg (1M views)</option><option value="relay">Relay (3M views)</option><option value="always_on">Always On (5M+ / month)</option><option value="custom">Custom</option>
          </select>
        </div>
      </div>
      <div className="grid">
        <div><label htmlFor="view_target">View target (verified)</label><input id="view_target" name="view_target" type="number" min={1} defaultValue={c?.view_target ?? 3000000} required /></div>
        <div><label htmlFor="revenue">Client pays (₹)</label><input id="revenue" name="revenue" type="number" min={0} step="1" defaultValue={r(c?.revenue_paise)} /></div>
        <div><label htmlFor="start_date">Start</label><input id="start_date" name="start_date" type="date" defaultValue={c?.start_date ?? ''} /></div>
        <div><label htmlFor="end_date">End</label><input id="end_date" name="end_date" type="date" defaultValue={c?.end_date ?? ''} /></div>
      </div>
      <div className="grid">
        <div><label htmlFor="visibility">Who can join</label>
          <select id="visibility" name="visibility" defaultValue={c?.visibility ?? 'public'}>
            <option value="public">Public: allowed tiers join directly</option><option value="application">Application: clippers apply, we approve</option><option value="private">Private: invite only</option>
          </select>
        </div>
        <div><label htmlFor="pay_model">Pay model</label>
          <select id="pay_model" name="pay_model" defaultValue={c?.pay_model ?? 'cpm'}>
            <option value="cpm">Per 1,000 verified views</option><option value="per_post">Flat fee per approved post</option><option value="retainer">Monthly retainer</option>
          </select>
        </div>
        <div><label htmlFor="per_clip_cap">Per-clip cap (views)</label><input id="per_clip_cap" name="per_clip_cap" type="number" min={1} defaultValue={c?.per_clip_cap_views ?? 500000} /></div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="muted" style={{ marginBottom: 6 }}>Rates per 1,000 verified views (₹)</legend>
        <div className="grid">
          <div><label htmlFor="rate_rookie">Rookie</label><input id="rate_rookie" name="rate_rookie" type="number" min={0} step="0.5" defaultValue={r(c?.rate_rookie_paise ?? 2000)} /></div>
          <div><label htmlFor="rate_runner">Runner</label><input id="rate_runner" name="rate_runner" type="number" min={0} step="0.5" defaultValue={r(c?.rate_runner_paise ?? 2500)} /></div>
          <div><label htmlFor="rate_anchor">Anchor</label><input id="rate_anchor" name="rate_anchor" type="number" min={0} step="0.5" defaultValue={r(c?.rate_anchor_paise ?? 3000)} /></div>
          <div><label htmlFor="per_post">Per post (₹, if per post)</label><input id="per_post" name="per_post" type="number" min={0} defaultValue={r(c?.per_post_paise)} /></div>
          <div><label htmlFor="retainer">Retainer (₹/month)</label><input id="retainer" name="retainer" type="number" min={0} defaultValue={r(c?.retainer_paise)} /></div>
        </div>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="muted" style={{ marginBottom: 6 }}>Tiers allowed</legend>
        <div className="checks">
          {['rookie', 'runner', 'anchor'].map((t) => <label key={t}><input type="checkbox" name="allowed_tiers" value={t} defaultChecked={tiers.includes(t)} />{t[0].toUpperCase() + t.slice(1)}</label>)}
        </div>
      </fieldset>
    </>
  );
}

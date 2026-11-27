// Runs the real migration in an in-memory Postgres (PGlite) with a small stand-in
// for Supabase's auth schema, then checks who can see and change what.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const id = {
  orgReelay: '00000000-0000-0000-0000-0000000000a0', orgA: '00000000-0000-0000-0000-0000000000a1', orgB: '00000000-0000-0000-0000-0000000000a2',
  admin: '00000000-0000-0000-0000-000000000001', admin2: '00000000-0000-0000-0000-000000000002', qa: '00000000-0000-0000-0000-000000000003', finance: '00000000-0000-0000-0000-000000000004',
  clientA: '00000000-0000-0000-0000-000000000011', clientB: '00000000-0000-0000-0000-000000000012',
  clipU1: '00000000-0000-0000-0000-000000000021', clipU2: '00000000-0000-0000-0000-000000000022',
  k1: '00000000-0000-0000-0000-000000000031', k2: '00000000-0000-0000-0000-000000000032',
  s1: '00000000-0000-0000-0000-000000000041', s2: '00000000-0000-0000-0000-000000000042',
  campA: '00000000-0000-0000-0000-000000000051', campB: '00000000-0000-0000-0000-000000000052',
  clip1: '00000000-0000-0000-0000-000000000061', clip2: '00000000-0000-0000-0000-000000000062', clip3: '00000000-0000-0000-0000-000000000063',
  run1: '00000000-0000-0000-0000-000000000071',
  campPriv: '00000000-0000-0000-0000-000000000053', campApp: '00000000-0000-0000-0000-000000000054', campPub: '00000000-0000-0000-0000-000000000055',
  clipU3: '00000000-0000-0000-0000-000000000023', k3: '00000000-0000-0000-0000-000000000033',
};

let db: PGlite;

/** Run SQL as a signed-in user, the way Supabase does it: role authenticated + JWT subject. */
async function as<T = any>(userId: string, sql: string): Promise<T[]> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId}', false); set role authenticated;`);
  try {
    const r = await db.query<T>(sql);
    return r.rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  // Minimal stand-in for what Supabase provides.
  await db.exec(`
    create role authenticated nologin;
    create role anon nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
  `);
  const dir = join(__dirname, '../supabase/migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  await db.exec(`
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    revoke update, delete, truncate on public.audit_log from authenticated;
    grant usage, select on all sequences in schema public to authenticated;
  `);
  // Seed as the owner (bypasses RLS).
  await db.exec(`
    insert into organisations (id, name, type) values ('${id.orgReelay}','Reelay','reelay'),('${id.orgA}','Brand A','client'),('${id.orgB}','Brand B','client');
    insert into users (id, organisation_id, name, email, role) values
      ('${id.admin}','${id.orgReelay}','Saurabh','s@reelay.test','super_admin'),
      ('${id.admin2}','${id.orgReelay}','Second admin','a2@reelay.test','super_admin'),
      ('${id.qa}','${id.orgReelay}','Riya','qa@reelay.test','qa_reviewer'),
      ('${id.finance}','${id.orgReelay}','Finance','f@reelay.test','finance'),
      ('${id.clientA}','${id.orgA}','Client A','a@brand.test','client_admin'),
      ('${id.clientB}','${id.orgB}','Client B','b@brand.test','client_admin'),
      ('${id.clipU1}',null,'Aarav','aarav@x.test','clipper'),
      ('${id.clipU2}',null,'Meera','meera@x.test','clipper');
    insert into clippers (id, user_id, tier, status, upi_masked) values ('${id.k1}','${id.clipU1}','runner','active','aa***@okaxis'),('${id.k2}','${id.clipU2}','anchor','active','me***@ybl');
    insert into social_accounts (id, clipper_id, handle, verified_at) values ('${id.s1}','${id.k1}','aarav.cuts',now()),('${id.s2}','${id.k2}','meera.edits',now());
    insert into campaigns (id, organisation_id, name, package, view_target, status) values
      ('${id.campA}','${id.orgA}','Founder Podcast','relay',3000000,'live'),
      ('${id.campB}','${id.orgB}','Other brand','first_leg',1000000,'live');
    insert into campaigns (id, organisation_id, name, package, view_target, status, visibility) values
      ('${id.campPriv}','${id.orgA}','Private','custom',100000,'live','private'),
      ('${id.campApp}','${id.orgA}','Apply','custom',100000,'live','application'),
      ('${id.campPub}','${id.orgA}','Open','custom',100000,'live','public');
    insert into users (id, name, email, role) values ('${id.clipU3}','Kabir','kabir@x.test','clipper');
    insert into clippers (id, user_id, tier, status) values ('${id.k3}','${id.clipU3}','rookie','active');
    insert into campaign_members (campaign_id, clipper_id) values ('${id.campA}','${id.k1}'),('${id.campA}','${id.k2}');
    insert into clips (id, campaign_id, clipper_id, social_account_id, reel_url, caption_code, posted_at, status) values
      ('${id.clip1}','${id.campA}','${id.k1}','${id.s1}','instagram.com/reel/one','RLY-AAAAA',now(),'locked'),
      ('${id.clip2}','${id.campA}','${id.k2}','${id.s2}','instagram.com/reel/two','RLY-BBBBB',now(),'in_review'),
      ('${id.clip3}','${id.campB}','${id.k2}','${id.s2}','instagram.com/reel/three','RLY-CCCCC',now(),'counting');
    insert into reviews (clip_id, reviewer_id, decision) values ('${id.clip1}','${id.admin2}','approved');
    insert into payout_runs (id, prepared_by) values ('${id.run1}','${id.finance}');
    insert into payout_items (clip_id, clipper_id, type, amount_paise, status, run_id) values
      ('${id.clip1}','${id.k1}','lock_70',550000,'in_run','${id.run1}'),
      ('${id.clip2}','${id.k2}','lock_70',300000,'pending',null);
  `);
});

describe('clients', () => {
  it('see only their own campaigns', async () => {
    const ids = (await as(id.clientA, 'select id from campaigns')).map((r: any) => r.id);
    expect(ids).toContain(id.campA);
    expect(ids).not.toContain(id.campB);
    const idsB = (await as(id.clientB, 'select id from campaigns')).map((r: any) => r.id);
    expect(idsB).toEqual([id.campB]);
  });
  it('see only verified clips, never ones in review, and never another brand', async () => {
    const rows = await as(id.clientA, 'select id from clips order by id');
    expect(rows.map((r: any) => r.id)).toEqual([id.clip1]);
  });
  it('cannot see clippers, payouts, reviews or flags', async () => {
    expect(await as(id.clientA, 'select * from clippers')).toHaveLength(0);
    expect(await as(id.clientA, 'select * from payout_items')).toHaveLength(0);
    expect(await as(id.clientA, 'select * from reviews')).toHaveLength(0);
  });
});

describe('clippers', () => {
  it('see only their own clips and payouts', async () => {
    expect((await as(id.clipU1, 'select id from clips')).map((r: any) => r.id)).toEqual([id.clip1]);
    expect(await as(id.clipU1, 'select * from payout_items')).toHaveLength(1);
  });
  it('cannot promote themselves', async () => {
    await expect(as(id.clipU1, `update clippers set tier = 'anchor' where user_id = '${id.clipU1}'`)).rejects.toThrow(/network team/);
  });
  it('can still edit their own city', async () => {
    await as(id.clipU1, `update clippers set city = 'Pune' where user_id = '${id.clipU1}'`);
    const [row] = await db.query<any>(`select city from clippers where id = '${id.k1}'`).then((r) => r.rows);
    expect(row.city).toBe('Pune');
  });
  it('cannot submit a clip as approved or for a campaign they have not joined', async () => {
    await expect(as(id.clipU1, `insert into clips (campaign_id, clipper_id, social_account_id, reel_url, caption_code, posted_at, status)
      values ('${id.campA}','${id.k1}','${id.s1}','instagram.com/reel/x1','RLY-XXXXX',now(),'locked')`)).rejects.toThrow();
    await expect(as(id.clipU1, `insert into clips (campaign_id, clipper_id, social_account_id, reel_url, caption_code, posted_at)
      values ('${id.campB}','${id.k1}','${id.s1}','instagram.com/reel/x2','RLY-YYYYY',now())`)).rejects.toThrow();
  });
  it('can submit a normal clip to a campaign they joined', async () => {
    await as(id.clipU1, `insert into clips (campaign_id, clipper_id, social_account_id, reel_url, caption_code, posted_at)
      values ('${id.campA}','${id.k1}','${id.s1}','instagram.com/reel/ok1','RLY-OKOKO',now())`);
    expect(await as(id.clipU1, 'select id from clips')).toHaveLength(2);
  });
  it('cannot update clip status', async () => {
    await as(id.clipU1, `update clips set status = 'locked' where caption_code = 'RLY-OKOKO'`);
    const [row] = await db.query<any>(`select status from clips where caption_code = 'RLY-OKOKO'`).then((r) => r.rows);
    expect(row.status).toBe('submitted');
  });
});

describe('payout release (separation of duties)', () => {
  it('blocks the admin who approved a clip in the run', async () => {
    await expect(as(id.admin2, `update payout_runs set status = 'released' where id = '${id.run1}'`)).rejects.toThrow(/approved a clip/);
  });
  it('blocks finance from releasing at all', async () => {
    await as(id.finance, `update payout_runs set status = 'released' where id = '${id.run1}'`);
    const [row] = await db.query<any>(`select status from payout_runs where id = '${id.run1}'`).then((r) => r.rows);
    expect(row.status).toBe('prepared');
  });
  it('lets an independent super admin release it, and records who did', async () => {
    await as(id.admin, `update payout_runs set status = 'released' where id = '${id.run1}'`);
    const [row] = await db.query<any>(`select status, released_by from payout_runs where id = '${id.run1}'`).then((r) => r.rows);
    expect(row).toEqual({ status: 'released', released_by: id.admin });
  });
});

describe('audit log', () => {
  it('records changes with the actor', async () => {
    const rows = await db.query<any>(`select actor_id from audit_log where object_type = 'payout_runs' and action = 'update'`).then((r) => r.rows);
    expect(rows.map((r: any) => r.actor_id)).toContain(id.admin);
  });
  it('cannot be edited or deleted, even by a super admin', async () => {
    await expect(as(id.admin, `delete from audit_log`)).rejects.toThrow();
    await expect(as(id.admin, `update audit_log set action = 'x'`)).rejects.toThrow();
  });
  it('is invisible to non-admins', async () => {
    expect(await as(id.qa, 'select * from audit_log')).toHaveLength(0);
  });
});

describe('campaign access (public, application, private)', () => {
  it('private campaigns are invisible to non-members', async () => {
    const rows = await as(id.clipU3, 'select name from campaigns order by name');
    expect(rows.map((r: any) => r.name)).not.toContain('Private');
    expect(rows.map((r: any) => r.name)).toEqual(expect.arrayContaining(['Apply', 'Open']));
  });
  it('clippers can join public campaigns directly', async () => {
    await as(id.clipU3, `insert into campaign_members (campaign_id, clipper_id) values ('${id.campPub}','${id.k3}')`);
    expect(await as(id.clipU3, 'select * from campaign_members')).toHaveLength(1);
  });
  it('but must apply to application campaigns', async () => {
    await expect(as(id.clipU3, `insert into campaign_members (campaign_id, clipper_id) values ('${id.campApp}','${id.k3}')`)).rejects.toThrow();
    await as(id.clipU3, `insert into campaign_applications (campaign_id, clipper_id, note) values ('${id.campApp}','${id.k3}','Food niche, 3 years editing')`);
    expect(await as(id.clipU3, 'select status from campaign_applications')).toEqual([{ status: 'pending' }]);
  });
  it('cannot apply to private campaigns or approve themselves', async () => {
    await expect(as(id.clipU3, `insert into campaign_applications (campaign_id, clipper_id) values ('${id.campPriv}','${id.k3}')`)).rejects.toThrow();
    await as(id.clipU3, `update campaign_applications set status = 'approved'`);
    expect(await as(id.clipU3, 'select status from campaign_applications')).toEqual([{ status: 'pending' }]);
  });
});

describe('account verification and KYC', () => {
  it('clippers cannot verify their own Instagram account', async () => {
    await as(id.clipU3, `insert into social_accounts (clipper_id, handle, verified_at) values ('${id.k3}','kabir.clips', now())`);
    const [row] = await db.query<any>(`select verified_at from social_accounts where handle = 'kabir.clips'`).then((r) => r.rows);
    expect(row.verified_at).toBeNull();
    await expect(as(id.clipU3, `update social_accounts set verified_at = now() where handle = 'kabir.clips'`)).rejects.toThrow(/network team/);
  });
  it('changing PAN resets the name match', async () => {
    await db.exec(`update clippers set name_match_status = 'matched' where id = '${id.k3}'`);
    await as(id.clipU3, `update clippers set pan_encrypted = 'v1:new' where id = '${id.k3}'`);
    const [row] = await db.query<any>(`select name_match_status from clippers where id = '${id.k3}'`).then((r) => r.rows);
    expect(row.name_match_status).toBe('pending');
  });
  it('test submissions cannot be self-scored', async () => {
    await expect(as(id.clipU3, `insert into test_submissions (clipper_id, links, score) values ('${id.k3}', array['instagram.com/reel/a'], 20)`)).rejects.toThrow();
    await as(id.clipU3, `insert into test_submissions (clipper_id, links) values ('${id.k3}', array['instagram.com/reel/a','instagram.com/reel/b'])`);
    expect(await as(id.clipU1, 'select * from test_submissions')).toHaveLength(0);
  });
});

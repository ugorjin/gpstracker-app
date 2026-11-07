/**
 * First-time setup: creates the platform (your company) organisation if it
 * doesn't exist, and an owner account in it.
 *
 *   ADMIN_PASSWORD='...' npm run create-admin -- --company "Acme Tracking" --name "Ada Obi" --email ada@acme.ng
 *   ADMIN_PASSWORD='...' npm run create-admin -- --name "Ada Obi" --phone 08031234567
 *
 * The password is read from ADMIN_PASSWORD so it doesn't appear in the
 * process list or shell history.
 */
import { parseArgs } from 'node:util';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../auth/password.js';
import { normalizeEmail, normalizePhone } from '../auth/phone.js';
import { migrate } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { createOrg, getPlatformOrg } from '../repo/orgs.js';
import { createUser } from '../repo/users.js';

async function main() {
  const { values } = parseArgs({
    options: {
      company: { type: 'string' },
      name: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      country: { type: 'string', default: 'NG' },
    },
  });
  const url = process.env.DATABASE_URL;
  const password = process.env.ADMIN_PASSWORD;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!values.name) throw new Error('--name is required');
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Set ADMIN_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters)`);
  }
  const email = values.email ? normalizeEmail(values.email) : undefined;
  const phone = values.phone ? normalizePhone(values.phone, values.country) : undefined;
  if (values.email && !email) throw new Error('Invalid --email');
  if (values.phone && !phone) throw new Error('Invalid --phone');
  if (!email && !phone) throw new Error('Give --email or --phone');

  const pool = createPool(url, 2);
  try {
    await migrate(pool, () => {});
    let org = await getPlatformOrg(pool);
    if (!org) {
      if (!values.company) throw new Error('No platform organization yet: pass --company "<your company name>"');
      org = await createOrg(pool, { parentId: null, type: 'platform', name: values.company, countryCode: values.country });
      console.log(`created platform organization "${org.name}" (id ${org.id})`);
    }
    const user = await createUser(pool, {
      orgId: org.id,
      name: values.name,
      email,
      phone,
      passwordHash: await hashPassword(password),
      role: 'owner',
    });
    console.log(`created owner "${user.name}" (id ${user.id}) in "${org.name}". Log in with ${email ?? phone}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

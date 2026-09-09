import request from 'supertest';
import { createApp } from '../app';
import { resetDb, disconnectDb } from './helpers/db';
import { createUser, loginAndGetCookie, TEST_PASSWORD } from './helpers/auth';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('POST /api/auth/register', () => {
  it('creates a new user and sets a session cookie', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Jane Doe',
      email: 'jane@test.com',
      password: 'Password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Jane Doe', email: 'jane@test.com', role: 'USER' });
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects a duplicate email with 409', async () => {
    await createUser({ email: 'dupe@test.com' });

    const res = await request(app).post('/api/auth/register').send({
      name: 'Someone Else',
      email: 'dupe@test.com',
      password: 'Password123',
    });

    expect(res.status).toBe(409);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Jane Doe',
      email: 'shortpass@test.com',
      password: 'short',
    });

    expect(res.status).toBe(400);
  });

  it('creates a new user with a phone number instead of email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Phone User',
      phone: '60123456789',
      password: 'Password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Phone User', phone: '60123456789', email: null });
  });

  it('accepts a phone number in local 0-prefixed format', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Local Phone User',
      phone: '0123456789',
      password: 'Password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Local Phone User', phone: '0123456789', email: null });
  });

  it('rejects a phone number containing letters', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Bad Phone User',
      phone: '60abc456789',
      password: 'Password123',
    });

    expect(res.status).toBe(400);
  });

  it('rejects a phone number with a leading +', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Plus Phone User',
      phone: '+60123456789',
      password: 'Password123',
    });

    expect(res.status).toBe(400);
  });

  it('rejects a phone number with spaces', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Spaced Phone User',
      phone: '60 123 456 789',
      password: 'Password123',
    });

    expect(res.status).toBe(400);
  });

  it('rejects a phone number longer than 13 digits', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Long Phone User',
      phone: '601234567891234',
      password: 'Password123',
    });

    expect(res.status).toBe(400);
  });

  it('rejects registration with neither email nor phone', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'No Contact',
      password: 'Password123',
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    await createUser({ email: 'login@test.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'login@test.com', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('login@test.com');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects an incorrect password with a generic 401 message', async () => {
    await createUser({ email: 'wrongpass@test.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'wrongpass@test.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('rejects an unknown identifier with the same generic message (no user enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nobody@test.com', password: 'whatever123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('rejects an admin account with the same generic message as an unknown user (admins must use /admin-login)', async () => {
    await createUser({ email: 'admin-via-user-login@test.com', role: 'ADMIN' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'admin-via-user-login@test.com', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });
});

describe('POST /api/auth/admin-login', () => {
  it('logs in an admin with correct credentials', async () => {
    await createUser({ email: 'realadmin@test.com', role: 'ADMIN' });

    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ identifier: 'realadmin@test.com', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'realadmin@test.com', role: 'ADMIN' });
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects a regular user account with the same generic message as an unknown user (users must use /login)', async () => {
    await createUser({ email: 'regular-via-admin-login@test.com', role: 'USER' });

    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ identifier: 'regular-via-admin-login@test.com', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('rejects an unknown identifier with the same generic message', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ identifier: 'nobody-admin@test.com', password: 'whatever123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });
});

describe('GET /api/auth/me', () => {
  it('rejects a request with no session cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user when a valid session cookie is sent', async () => {
    const user = await createUser({ email: 'me@test.com' });
    const cookie = await loginAndGetCookie(app, 'me@test.com');

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });
});

describe('PATCH /api/auth/me', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).patch('/api/auth/me').send({ name: 'New Name', email: 'new@test.com' });
    expect(res.status).toBe(401);
  });

  it('updates name, email, and phone for the logged-in user', async () => {
    await createUser({ email: 'update@test.com' });
    const cookie = await loginAndGetCookie(app, 'update@test.com');

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Cookie', cookie)
      .send({ name: 'Updated Name', email: 'updated@test.com', phone: '60123456789' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: 'Updated Name',
      email: 'updated@test.com',
      phone: '60123456789',
    });
  });

  it('rejects a profile update that would leave both email and phone empty', async () => {
    await createUser({ email: 'nocontact@test.com' });
    const cookie = await loginAndGetCookie(app, 'nocontact@test.com');

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Cookie', cookie)
      .send({ name: 'Still Has A Name' });

    expect(res.status).toBe(400);
  });

  it('rejects updating to an email already used by another account', async () => {
    await createUser({ email: 'taken@test.com' });
    await createUser({ email: 'wants-taken@test.com' });
    const cookie = await loginAndGetCookie(app, 'wants-taken@test.com');

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Cookie', cookie)
      .send({ name: 'Wants Taken Email', email: 'taken@test.com' });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/change-password', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewPassword123' });

    expect(res.status).toBe(401);
  });

  it('rejects an incorrect current password', async () => {
    await createUser({ email: 'changepw-wrong@test.com' });
    const cookie = await loginAndGetCookie(app, 'changepw-wrong@test.com');

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'wrong-password', newPassword: 'NewPassword123' });

    expect(res.status).toBe(401);
  });

  it('rejects a new password shorter than 8 characters', async () => {
    await createUser({ email: 'changepw-short@test.com' });
    const cookie = await loginAndGetCookie(app, 'changepw-short@test.com');

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'short' });

    expect(res.status).toBe(400);
  });

  it('changes the password, and the new password works on the next login', async () => {
    await createUser({ email: 'changepw-ok@test.com' });
    const cookie = await loginAndGetCookie(app, 'changepw-ok@test.com');

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewPassword123' });

    expect(res.status).toBe(204);

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'changepw-ok@test.com', password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'changepw-ok@test.com', password: 'NewPassword123' });
    expect(newLogin.status).toBe(200);
  });
});

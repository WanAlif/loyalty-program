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

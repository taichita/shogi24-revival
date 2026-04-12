import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { findOrCreateGoogleUser, getUserById, type DbUser } from './db.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const JWT_SECRET = process.env.JWT_SECRET ?? 'shogi24-dev-secret';
const SERVER_URL = process.env.SERVER_URL ?? `http://localhost:${process.env.PORT ?? 3025}`;
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:3024';

const oauth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  `${SERVER_URL}/auth/google/callback`,
);

export const authRouter = Router();

/** Google OAuth 開始 */
authRouter.get('/google', (_req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'profile', 'email'],
  });
  res.redirect(url);
});

/** Google OAuth コールバック */
authRouter.get('/google/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send('Missing code');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload()!;

    const googleId = payload.sub;
    const displayName = payload.name ?? payload.email ?? 'Player';
    const avatarUrl = payload.picture;

    const user = findOrCreateGoogleUser(googleId, displayName, avatarUrl);

    const needsHandle = !user.handle;
    const token = jwt.sign(
      { userId: user.id, handle: user.handle, needsHandle },
      JWT_SECRET,
      { expiresIn: '30d' },
    );

    res.redirect(`${CLIENT_URL}/online?token=${token}`);
  } catch (err) {
    console.error('[auth] Google OAuth error:', err);
    res.status(500).send('認証に失敗しました');
  }
});

/** JWTを検証してDbUserを返す */
export function verifyToken(token: string): DbUser | undefined {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; handle: string | null };
    return getUserById(decoded.userId);
  } catch {
    return undefined;
  }
}


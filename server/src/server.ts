import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { getAccessToken } from './services/googleAuthService';
import nestRouter from './routes/nest';

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT) || 3001;

app.use(
  cors({
    origin: 'http://localhost:5173',
  })
);

app.use(express.json());
app.use('/api/nest', nestRouter);

app.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'eY OS Server',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(
    `eY OS Server running at http://localhost:${PORT}`
  );
});

app.get('/token-test', async (_, res) => {
    try {
      const token = await getAccessToken();
  
      res.json({
        success: true,
        length: token.length,
      });
    } catch (error) {
      res.status(500).json(error);
    }
  });
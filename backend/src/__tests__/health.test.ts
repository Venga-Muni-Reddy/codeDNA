import request from 'supertest';
import { app } from '../app';

describe('GET /api/health', () => {
  it('should return 200 OK and correct JSON structure', async () => {
    const response = await request(app).get('/api/health');
    
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'CodeAtlas AI Backend is active and running',
      data: expect.objectContaining({
        timestamp: expect.any(String),
      }),
      errors: null,
      meta: {},
    });
  });
});

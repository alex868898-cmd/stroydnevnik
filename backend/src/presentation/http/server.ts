import Fastify from 'fastify';

const fastify = Fastify({
  logger: true
});

// GET /health
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    const host = '127.0.0.1'; // Listen only locally

    await fastify.listen({ port, host });
    console.log(`Server is listening on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

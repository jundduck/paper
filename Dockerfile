FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/storage
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
COPY --chown=node:node data/seed.json ./data/seed.json
RUN mkdir /app/storage && chown node:node /app/storage
USER node
EXPOSE 3000
VOLUME /app/storage
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]

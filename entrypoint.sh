#!/bin/sh

# Replace placeholders in nginx.conf
export API_UPSTREAM="${API_UPSTREAM:-http://chartdb-api:3001}"
envsubst '${OPENAI_API_KEY} ${OPENAI_API_ENDPOINT} ${LLM_MODEL_NAME} ${HIDE_CHARTDB_CLOUD} ${DISABLE_ANALYTICS} ${API_UPSTREAM}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Start Nginx
nginx -g "daemon off;"

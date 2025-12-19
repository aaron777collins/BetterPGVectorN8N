FROM docker.n8n.io/n8nio/n8n:latest

USER root

# Copy initialization script with proper permissions
COPY init-nodes.sh /init-nodes.sh
RUN chmod 755 /init-nodes.sh && chown node:node /init-nodes.sh

USER node

# Override entrypoint to run init script first
ENTRYPOINT ["/bin/sh", "-c", "/init-nodes.sh && exec n8n \"$@\"", "--"]

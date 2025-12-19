#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

PACKAGE_NAME="n8n-nodes-pgvector-advanced"

# ------------------------------------------------------------------------------
# Helper functions
# ------------------------------------------------------------------------------

print_header() {
    echo ""
    echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${BLUE}║${NC}  ${BOLD}n8n-nodes-pgvector-advanced Installer${NC}                         ${BOLD}${BLUE}║${NC}"
    echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${CYAN}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

confirm() {
    local prompt="$1"
    local default="${2:-y}"

    if [ "$default" = "y" ]; then
        prompt="$prompt [Y/n] "
    else
        prompt="$prompt [y/N] "
    fi

    read -p "$prompt" response
    response=${response:-$default}
    [[ "$response" =~ ^[Yy]$ ]]
}

# ------------------------------------------------------------------------------
# Detection functions
# ------------------------------------------------------------------------------

detect_docker_compose() {
    if [ -f "docker-compose.yml" ] || [ -f "docker-compose.yaml" ]; then
        COMPOSE_FILE=$([ -f "docker-compose.yml" ] && echo "docker-compose.yml" || echo "docker-compose.yaml")
        if grep -q "n8n" "$COMPOSE_FILE" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

detect_running_n8n_container() {
    if command -v docker &> /dev/null; then
        N8N_CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i n8n | head -1)
        if [ -n "$N8N_CONTAINER" ]; then
            return 0
        fi
    fi
    return 1
}

detect_n8n_npm() {
    if command -v n8n &> /dev/null; then
        N8N_PATH=$(which n8n)
        return 0
    fi
    return 1
}

detect_n8n_data_dir() {
    # Check common n8n data directories
    if [ -d "$HOME/.n8n" ]; then
        N8N_DATA_DIR="$HOME/.n8n"
        return 0
    elif [ -d "/home/node/.n8n" ]; then
        N8N_DATA_DIR="/home/node/.n8n"
        return 0
    fi
    return 1
}

get_n8n_service_name() {
    # Extract n8n service name from docker-compose
    grep -B50 "n8n" "$COMPOSE_FILE" | grep -E "^  [a-zA-Z0-9_-]+:" | tail -1 | sed 's/://g' | tr -d ' '
}

# ------------------------------------------------------------------------------
# Installation methods
# ------------------------------------------------------------------------------

install_docker_compose_persistent() {
    print_step "Setting up persistent Docker installation..."

    local service_name=$(get_n8n_service_name)
    local n8n_dir="n8n"

    # Check if already using build
    if grep -A2 "^  ${service_name}:" "$COMPOSE_FILE" | grep -q "build:"; then
        print_warning "n8n service already uses a custom build"
        if confirm "Overwrite existing setup?"; then
            :
        else
            return 1
        fi
    fi

    # Create backup
    local backup_file="${COMPOSE_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$COMPOSE_FILE" "$backup_file"
    print_success "Backup created: $backup_file"

    # Create n8n directory
    mkdir -p "$n8n_dir"

    # Create Dockerfile
    cat > "$n8n_dir/Dockerfile" << 'DOCKERFILE'
FROM docker.n8n.io/n8nio/n8n:latest

USER root

# Copy initialization script with proper permissions
COPY init-nodes.sh /init-nodes.sh
RUN chmod 755 /init-nodes.sh && chown node:node /init-nodes.sh

USER node

# Override entrypoint to run init script first
ENTRYPOINT ["/bin/sh", "-c", "/init-nodes.sh && exec n8n \"$@\"", "--"]
DOCKERFILE
    print_success "Created $n8n_dir/Dockerfile"

    # Create init script
    cat > "$n8n_dir/init-nodes.sh" << 'INITSCRIPT'
#!/bin/sh
set -e

# =============================================================================
# n8n Community Nodes Auto-Installer
# Add packages to PACKAGES variable (space-separated) to auto-install on startup
# =============================================================================

PACKAGES="n8n-nodes-pgvector-advanced"
NODES_DIR="/home/node/.n8n/nodes"

mkdir -p "$NODES_DIR"
cd "$NODES_DIR"

# Initialize npm if package.json doesn't exist
if [ ! -f "package.json" ]; then
    npm init -y > /dev/null 2>&1
fi

# Install or update each package
for pkg in $PACKAGES; do
    if [ ! -d "node_modules/$pkg" ]; then
        echo "[init-nodes] Installing: $pkg"
        npm install "$pkg" --save --loglevel=warn
        echo "[init-nodes] Installed: $pkg"
    else
        echo "[init-nodes] Checking for updates: $pkg"
        npm update "$pkg" --loglevel=warn
    fi
done
INITSCRIPT
    chmod +x "$n8n_dir/init-nodes.sh"
    print_success "Created $n8n_dir/init-nodes.sh"

    # Update docker-compose.yml
    # Replace image: with build:
    if grep -A2 "^  ${service_name}:" "$COMPOSE_FILE" | grep -q "image:.*n8n"; then
        sed -i.tmp "s|image:.*n8n.*|build: ./$n8n_dir|" "$COMPOSE_FILE"
        rm -f "${COMPOSE_FILE}.tmp"
        print_success "Updated $COMPOSE_FILE to use custom build"
    else
        print_warning "Could not auto-update $COMPOSE_FILE"
        print_info "Manually change 'image: ...' to 'build: ./$n8n_dir' for the n8n service"
    fi

    # Rebuild and restart
    if confirm "Rebuild and restart n8n now?"; then
        print_step "Building custom n8n image..."
        docker compose build "$service_name"
        print_step "Restarting n8n..."
        docker compose up -d "$service_name"
        sleep 5
        print_step "Checking logs..."
        docker compose logs "$service_name" --tail 20 | grep -E "(init-nodes|Installing|Installed|Already installed)" || true
        print_success "Done! n8n should now have $PACKAGE_NAME installed"
    else
        print_info "Run these commands when ready:"
        echo "  docker compose build $service_name"
        echo "  docker compose up -d $service_name"
    fi
}

install_docker_container_direct() {
    print_step "Installing directly into running container: $N8N_CONTAINER"

    print_warning "This installation will persist in the container's volume,"
    print_warning "but will be lost if the volume is deleted."

    if ! confirm "Continue?"; then
        return 1
    fi

    print_step "Installing $PACKAGE_NAME..."
    docker exec "$N8N_CONTAINER" sh -c "
        mkdir -p /home/node/.n8n/nodes
        cd /home/node/.n8n/nodes
        if [ ! -f package.json ]; then npm init -y > /dev/null 2>&1; fi
        npm install $PACKAGE_NAME --save
    "

    print_success "Package installed!"

    if confirm "Restart n8n container to load the new node?"; then
        docker restart "$N8N_CONTAINER"
        print_success "Container restarted"
    else
        print_info "Restart the container manually: docker restart $N8N_CONTAINER"
    fi
}

install_npm_global() {
    print_step "Installing via npm to n8n's custom nodes directory..."

    local nodes_dir="$HOME/.n8n/nodes"
    mkdir -p "$nodes_dir"
    cd "$nodes_dir"

    if [ ! -f "package.json" ]; then
        npm init -y > /dev/null 2>&1
    fi

    print_step "Installing $PACKAGE_NAME..."
    npm install "$PACKAGE_NAME" --save

    print_success "Package installed to $nodes_dir"
    print_info "Restart n8n to load the new node"
}

install_n8n_cli() {
    print_step "Installing via n8n CLI..."

    if command -v n8n &> /dev/null; then
        print_info "Using n8n CLI to install community node..."
        print_warning "Note: This requires n8n to be stopped first"

        if confirm "Proceed with n8n CLI installation?"; then
            n8n community-package install "$PACKAGE_NAME" || {
                print_error "CLI installation failed, falling back to npm method"
                install_npm_global
            }
        fi
    else
        print_error "n8n CLI not found"
        return 1
    fi
}

create_standalone_compose() {
    print_step "Creating standalone docker-compose setup..."

    local target_dir="${1:-.}"

    if [ -f "$target_dir/docker-compose.yml" ]; then
        if ! confirm "docker-compose.yml exists. Overwrite?"; then
            return 1
        fi
        cp "$target_dir/docker-compose.yml" "$target_dir/docker-compose.yml.backup.$(date +%Y%m%d_%H%M%S)"
    fi

    mkdir -p "$target_dir/n8n"

    # Create docker-compose.yml
    cat > "$target_dir/docker-compose.yml" << 'COMPOSEFILE'
services:
  postgres:
    image: ankane/pgvector:latest
    restart: always
    environment:
      POSTGRES_DB: n8n
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U n8n -d n8n"]
      interval: 5s
      timeout: 5s
      retries: 5

  n8n:
    build: ./n8n
    restart: always
    ports:
      - "${N8N_PORT:-5678}:5678"
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
      DB_POSTGRESDB_SCHEMA: public
      GENERIC_TIMEZONE: ${TZ:-UTC}
      N8N_HOST: ${N8N_HOST:-localhost}
      N8N_PORT: 5678
      N8N_PROTOCOL: ${N8N_PROTOCOL:-http}
      WEBHOOK_URL: ${WEBHOOK_URL:-http://localhost:5678/}
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  n8n_data:
  pgdata:
COMPOSEFILE
    print_success "Created $target_dir/docker-compose.yml"

    # Create Dockerfile
    cat > "$target_dir/n8n/Dockerfile" << 'DOCKERFILE'
FROM docker.n8n.io/n8nio/n8n:latest

USER root
COPY init-nodes.sh /init-nodes.sh
RUN chmod 755 /init-nodes.sh && chown node:node /init-nodes.sh

USER node
ENTRYPOINT ["/bin/sh", "-c", "/init-nodes.sh && exec n8n \"$@\"", "--"]
DOCKERFILE
    print_success "Created $target_dir/n8n/Dockerfile"

    # Create init script
    cat > "$target_dir/n8n/init-nodes.sh" << 'INITSCRIPT'
#!/bin/sh
set -e

PACKAGES="n8n-nodes-pgvector-advanced"
NODES_DIR="/home/node/.n8n/nodes"

mkdir -p "$NODES_DIR"
cd "$NODES_DIR"

if [ ! -f "package.json" ]; then
    npm init -y > /dev/null 2>&1
fi

for pkg in $PACKAGES; do
    if [ ! -d "node_modules/$pkg" ]; then
        echo "[init-nodes] Installing: $pkg"
        npm install "$pkg" --save --loglevel=warn
    else
        echo "[init-nodes] Checking for updates: $pkg"
        npm update "$pkg" --loglevel=warn
    fi
done
INITSCRIPT
    chmod +x "$target_dir/n8n/init-nodes.sh"
    print_success "Created $target_dir/n8n/init-nodes.sh"

    # Create .env example
    cat > "$target_dir/.env.example" << 'ENVFILE'
# Database
POSTGRES_PASSWORD=changeme

# n8n Configuration
N8N_PORT=5678
N8N_HOST=localhost
N8N_PROTOCOL=http
WEBHOOK_URL=http://localhost:5678/
TZ=UTC
ENVFILE
    print_success "Created $target_dir/.env.example"

    echo ""
    print_success "Standalone setup created!"
    echo ""
    print_info "Next steps:"
    echo "  1. cp .env.example .env"
    echo "  2. Edit .env with your settings"
    echo "  3. docker compose up -d"
    echo ""
    print_info "n8n will be available at http://localhost:5678"
}

show_manual_instructions() {
    echo ""
    echo -e "${BOLD}Manual Installation Instructions${NC}"
    echo ""
    echo "1. ${BOLD}For Docker Compose:${NC}"
    echo "   - Copy examples/docker/* to your project"
    echo "   - Change 'image: n8nio/n8n' to 'build: ./n8n' in docker-compose.yml"
    echo "   - Run: docker compose build && docker compose up -d"
    echo ""
    echo "2. ${BOLD}For running container:${NC}"
    echo "   docker exec -it <container> sh -c '"
    echo "     mkdir -p /home/node/.n8n/nodes && cd /home/node/.n8n/nodes &&"
    echo "     npm init -y && npm install $PACKAGE_NAME"
    echo "   '"
    echo "   docker restart <container>"
    echo ""
    echo "3. ${BOLD}For npm/local install:${NC}"
    echo "   mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes"
    echo "   npm init -y && npm install $PACKAGE_NAME"
    echo "   # Restart n8n"
    echo ""
    echo "4. ${BOLD}Via n8n UI:${NC}"
    echo "   Settings > Community Nodes > Install > $PACKAGE_NAME"
    echo ""
}

# ------------------------------------------------------------------------------
# Main menu
# ------------------------------------------------------------------------------

show_menu() {
    echo ""
    echo -e "${BOLD}Detected Environment:${NC}"

    local options=()
    local opt_num=1

    if detect_docker_compose; then
        print_success "Docker Compose with n8n found: $COMPOSE_FILE"
        options+=("docker-compose")
        echo "  $opt_num) Install with Docker persistence (recommended)"
        ((opt_num++))
    fi

    if detect_running_n8n_container; then
        print_success "Running n8n container found: $N8N_CONTAINER"
        options+=("docker-direct")
        echo "  $opt_num) Install directly into running container"
        ((opt_num++))
    fi

    if detect_n8n_npm; then
        print_success "n8n CLI found: $N8N_PATH"
        options+=("n8n-cli")
        echo "  $opt_num) Install via n8n CLI"
        ((opt_num++))
    fi

    if detect_n8n_data_dir; then
        print_success "n8n data directory found: $N8N_DATA_DIR"
        options+=("npm-local")
        echo "  $opt_num) Install via npm to ~/.n8n/nodes"
        ((opt_num++))
    fi

    # Always available options
    options+=("update")
    echo "  $opt_num) Update existing installation to latest version"
    ((opt_num++))

    options+=("standalone")
    echo "  $opt_num) Create new standalone Docker setup"
    ((opt_num++))

    options+=("manual")
    echo "  $opt_num) Show manual installation instructions"
    ((opt_num++))

    options+=("quit")
    echo "  $opt_num) Quit"

    echo ""
    read -p "Select an option [1-$opt_num]: " choice

    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#options[@]}" ]; then
        local selected="${options[$((choice-1))]}"
        echo ""

        case "$selected" in
            "docker-compose")
                install_docker_compose_persistent
                ;;
            "docker-direct")
                install_docker_container_direct
                ;;
            "n8n-cli")
                install_n8n_cli
                ;;
            "npm-local")
                install_npm_global
                ;;
            "update")
                print_step "Updating $PACKAGE_NAME to latest version..."
                if detect_running_n8n_container; then
                    print_info "Updating in container: $N8N_CONTAINER"
                    docker exec "$N8N_CONTAINER" sh -c "
                        cd /home/node/.n8n/nodes 2>/dev/null || exit 1
                        npm update $PACKAGE_NAME
                    "
                    print_success "Package updated!"
                    if confirm "Restart container to apply update?"; then
                        docker restart "$N8N_CONTAINER"
                        print_success "Container restarted"
                    fi
                elif detect_n8n_data_dir; then
                    print_info "Updating in: $N8N_DATA_DIR/nodes"
                    cd "$N8N_DATA_DIR/nodes" && npm update "$PACKAGE_NAME"
                    print_success "Package updated! Restart n8n to apply."
                else
                    print_error "No n8n installation found to update"
                fi
                ;;
            "standalone")
                read -p "Target directory [.]: " target_dir
                target_dir="${target_dir:-.}"
                create_standalone_compose "$target_dir"
                ;;
            "manual")
                show_manual_instructions
                ;;
            "quit")
                echo "Bye!"
                exit 0
                ;;
        esac
    else
        print_error "Invalid option"
        show_menu
    fi
}

# ------------------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------------------

main() {
    print_header

    # Check for help flag
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  -h, --help      Show this help message"
        echo "  --standalone    Create standalone Docker setup in current directory"
        echo "  --docker        Install with Docker persistence (auto-detect compose)"
        echo "  --direct        Install into running container"
        echo "  --npm           Install via npm to ~/.n8n/nodes"
        echo "  --update        Update to latest version (works with --direct, --npm)"
        echo ""
        echo "The init script auto-checks for updates on each container start."
        echo ""
        exit 0
    fi

    # Handle direct flags
    case "$1" in
        "--standalone")
            create_standalone_compose "${2:-.}"
            exit 0
            ;;
        "--docker")
            if detect_docker_compose; then
                install_docker_compose_persistent
            else
                print_error "No docker-compose.yml with n8n found"
                exit 1
            fi
            exit 0
            ;;
        "--direct")
            if detect_running_n8n_container; then
                install_docker_container_direct
            else
                print_error "No running n8n container found"
                exit 1
            fi
            exit 0
            ;;
        "--npm")
            install_npm_global
            exit 0
            ;;
        "--update")
            print_step "Updating $PACKAGE_NAME to latest version..."
            if detect_running_n8n_container; then
                print_info "Updating in container: $N8N_CONTAINER"
                docker exec "$N8N_CONTAINER" sh -c "
                    cd /home/node/.n8n/nodes 2>/dev/null || exit 1
                    npm update $PACKAGE_NAME
                "
                print_success "Package updated!"
                if confirm "Restart container to apply update?"; then
                    docker restart "$N8N_CONTAINER"
                    print_success "Container restarted"
                fi
            elif detect_n8n_data_dir; then
                print_info "Updating in: $N8N_DATA_DIR/nodes"
                cd "$N8N_DATA_DIR/nodes" && npm update "$PACKAGE_NAME"
                print_success "Package updated! Restart n8n to apply."
            else
                print_error "No n8n installation found to update"
                exit 1
            fi
            exit 0
            ;;
    esac

    # Interactive mode
    show_menu

    echo ""
    print_info "Need help? Check the README at:"
    echo "  https://github.com/aaron777collins/BetterPGVectorN8N"
    echo ""
}

main "$@"

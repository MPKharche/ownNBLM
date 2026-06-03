.PHONY: dev seed test lint migrate health reset install-backend install-frontend

ROOT := $(CURDIR)
BACKEND := $(ROOT)/backend
FRONTEND := $(ROOT)/frontend
PYTHON ?= python

dev:
	docker compose up --build

seed:
	cd $(BACKEND) && $(PYTHON) -m app.seed

test:
	cd $(BACKEND) && $(PYTHON) -m pytest -q
	cd $(FRONTEND) && npm run test --if-present

lint:
	cd $(BACKEND) && ruff check app && mypy app --ignore-missing-imports
	cd $(FRONTEND) && npm run lint --if-present

migrate:
	cd $(BACKEND) && $(PYTHON) -m alembic upgrade head

health:
	@curl -sf http://localhost:8000/health | $(PYTHON) -m json.tool || (echo "API not reachable — run make dev first" && exit 1)

reset:
ifeq ($(ENVIRONMENT),production)
	$(error reset is disabled when ENVIRONMENT=production)
endif
	rm -f $(BACKEND)/ownNBLM.db ./data/ownNBLM.db ./data/huey.db
	rm -rf ./data/files/*
	$(MAKE) migrate seed

install-backend:
	$(PYTHON) -m pip install -e $(BACKEND)
	$(PYTHON) -m pip install -e $(ROOT)/../PageIndex

install-frontend:
	cd $(FRONTEND) && npm install

install: install-backend install-frontend

sync-key:
	$(PYTHON) scripts/sync_env_key.py

# Local dev without Docker (frees port 8000 first — avoids ghost listeners on Windows)
dev-local-api: restart-api

restart-api:
	-$(PYTHON) scripts/kill_port.py 8000
	cd $(BACKEND) && $(PYTHON) -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

dev-local-web:
	cd $(FRONTEND) && npm run dev

dev-local:
	@echo "Run in two terminals: make dev-local-api && make dev-local-web"

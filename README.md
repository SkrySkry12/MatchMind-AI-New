# MatchMind AI

Polskojęzyczna PWA do analizy danych piłkarskich. Backend pobiera dane z API-FOOTBALL v3, ogranicza liczbę zapytań cache'em i może używać lokalnego modelu Ollama do opisowych raportów.

## Wdrożenie przez Coolify (Docker Compose)

Repozytorium jest przygotowane do wdrożenia bez osobnego pliku `.env`: konfiguracja kontenerów korzysta ze zmiennych podstawianych przez Docker Compose. W Coolify połącz repozytorium z branchem `main` i wykonaj redeploy.

**Przed wdrożeniem produkcyjnym ustaw w zmiennych środowiskowych zasoby Compose (jeśli korzystasz z tej funkcji Coolify):**
- `FOOTBALL_API_KEY` — nowy klucz API-FOOTBALL.
- `POSTGRES_PASSWORD` — długie, losowe hasło bazy danych. Musi pozostać takie samo przy kolejnych wdrożeniach.
- Opcjonalnie `LLM_ENABLED=false` i `OLLAMA_MODEL=qwen3:0.6b`.

Jeśli Coolify nie ma osobnej sekcji zmiennych dla tego zasobu, możesz zdefiniować wartości w edytorze Docker Compose jako podstawiane zmienne albo użyć pliku `.env` dostępnego dla wdrożenia. Nie wpisuj sekretów do repozytorium. Wartości domyślne w Compose służą wyłącznie do uruchomienia testowego; domyślne hasło PostgreSQL `matchmind` nie jest bezpieczne dla produkcji.

Wolumen `pgdata` przechowuje dane PostgreSQL pomiędzy restartami i ponownymi wdrożeniami. Nie usuwaj go podczas redeploy.

## VPS 4 vCPU / 4 GB RAM

Domyślny model: `qwen3:0.6b` (CPU, bez GPU), kontekst 2048 tokenów, jedna równoległa generacja. To świadomie mały model — matematyka i statystyki powinny być liczone deterministycznie w backendzie, a LLM ma jedynie opisywać wnioski. Model 1.7B może być testowany dopiero po zwiększeniu RAM do 8 GB lub przeniesieniu inference na osobny host.

## Lokalny LLM (opcjonalny)

LLM jest domyślnie wyłączony, żeby nie obciążał małego VPS bez świadomej decyzji. Usługa Ollama ma profil `local-ai`; uruchomienie jej zależy od konfiguracji profili w środowisku wdrożeniowym. Po uruchomieniu Ollamy pobierz model `qwen3:0.6b` w kontenerze Ollama i ustaw `LLM_ENABLED=true`. Ollama działa wewnątrz sieci Dockera i nie publikuje portu 11434 na publiczny interfejs. Nie wystawiaj API Ollama bezpośrednio do internetu.

## API

- `GET /api/health` — status aplikacji i API
- `GET /api/usage` — liczniki zapytań i cache
- `GET /api/fixtures?date=YYYY-MM-DD` — mecze
- `GET /api/matches/:id/stats` — statystyki meczu
- `POST /api/matches/:id/analyze` — raport na podstawie dostępnych danych

## Cache

Terminarze: 60 s; statystyki i zdarzenia: 5 min; składy: 15 min; kontuzje: 4 h; predykcje: 1 h. Cache jest obecnie pamięciowy i czyści się po restarcie procesu.

## Bezpieczeństwo

Klucze API wyłącznie w środowisku serwera. Nigdy nie commituj `.env`. Nie umieszczaj kluczy w frontendzie. Pokrycie statystyk zależy od ligi i sezonu.

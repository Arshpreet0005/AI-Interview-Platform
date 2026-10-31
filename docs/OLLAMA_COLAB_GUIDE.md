# Setting Up Ollama on Free Google Colab with a Secure Temporary Tunnel

This guide walks you through running Ollama on Google Colab's free T4 GPU and connecting it to your AI Interview Platform via a secure tunnel.

---

## Prerequisites
- A Google account (to use [Google Colab](https://colab.research.google.com/)).
- A free [ngrok account](https://dashboard.ngrok.com/signup) (recommended for secure, authenticated tunneling) OR use Cloudflare Tunnel.

---

## Step 1: Create a Colab Notebook with GPU
1. Go to [Google Colab](https://colab.research.google.com/) and create a **New Notebook**.
2. Click **Runtime** → **Change runtime type**.
3. Select **T4 GPU** under Hardware Accelerator and click **Save**.

---

## Step 2: Install Ollama
In a code cell, run:
```bash
!curl -fsSL https://ollama.com/install.sh | sh
```

---

## Step 3: Start Ollama in the Background
In the next code cell, run:
```python
import subprocess
import time

# Start Ollama server as a background process
ollama_proc = subprocess.Popen(["ollama", "serve"])
time.sleep(3)
print("Ollama server started successfully.")
```

---

## Step 4: Download a Lightweight Model
Choose a fast, lightweight model suited for interview question generation and evaluation:

```bash
# Recommended: Llama 3.2 1B (Ultra-fast, ~1.3 GB)
!ollama pull llama3.2:1b

# Alternative: Llama 3.2 3B (Higher reasoning accuracy, ~2.0 GB)
# !ollama pull llama3.2:3b

# Alternative: Qwen 2.5 Coder 1.5B (Strong technical/code performance, ~1.0 GB)
# !ollama pull qwen2.5-coder:1.5b
```

---

## Step 5: Expose Ollama with a Secure Tunnel

### Option A: ngrok (Recommended)
1. Sign up for free at [ngrok.com](https://dashboard.ngrok.com/signup).
2. Get your authtoken from the [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken).
3. In a Colab cell, run:

```python
!pip install pyngrok

from pyngrok import ngrok

# Replace with your actual ngrok authtoken
NGROK_AUTHTOKEN = "YOUR_NGROK_AUTHTOKEN_HERE"
ngrok.set_auth_token(NGROK_AUTHTOKEN)

# Expose Ollama's default port 11434
tunnel = ngrok.connect(11434, "http")
print("\n" + "=" * 50)
print("🔗 Public Ollama Tunnel URL:")
print(tunnel.public_url)
print("=" * 50)
```

Copy the printed URL (e.g., `https://xxxx-xx-xx-xx.ngrok-free.app`).

---

### Option B: Cloudflare Tunnel (No Signup Required)
Alternatively, run Cloudflare tunnel:
```bash
!wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i cloudflared-linux-amd64.deb
!cloudflared tunnel --url http://localhost:11434
```
Copy the `.trycloudflare.com` URL shown in the logs.

---

## Step 6: Configure Your AI Interview Platform `.env`
In your backend `server/.env` file, configure the following variables:

```env
# Switch primary provider to Ollama
AI_PROVIDER=ollama

# Set your Colab tunnel URL and downloaded model
OLLAMA_BASE_URL=https://your-tunnel-subdomain.ngrok-free.app
OLLAMA_MODEL=llama3.2:1b

# Request timeout (90 seconds recommended for network tunnels)
OLLAMA_TIMEOUT_MS=90000

# Keep Gemini and OpenRouter configured for automatic fallback
GEMINI_API_KEY=your_gemini_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free
```

---

## Step 7: Verify Connectivity
You can test the tunnel from your local machine using curl in PowerShell or terminal:

```bash
curl -X POST "https://your-tunnel-subdomain.ngrok-free.app/api/generate" `
  -H "Content-Type: application/json" `
  -H "ngrok-skip-browser-warning: true" `
  -d '{"model":"llama3.2:1b","prompt":"Say hello in JSON: {\"message\": \"...\"}","stream":false}'
```

---

## Important Tips
1. **Colab Keep-Alive**: Free Google Colab sessions disconnect after 90 minutes of inactivity or 12 hours total. Keep the browser tab open while running interviews.
2. **Fallback Safety**: If your Colab disconnects mid-interview, the backend automatically falls back to **Gemini**, and if Gemini hits quota/rate limits, to **OpenRouter**.
3. **Tunnel Reconnect**: If you restart the Colab runtime, update `OLLAMA_BASE_URL` in `server/.env` with the new tunnel URL.

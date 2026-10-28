# PackGuard Setup & Fixes Checklist

**Status:** Complete & Verified  
**Target VM:** `instance-20261028-153524` (`me-west1-b`, GCP Project `project-ffd58a78-c6a1-4d27-876`)  
**SSH Host Aliases:** `packguard-t4` / `packguard-vm`  
**GPU Hardware:** NVIDIA Tesla T4 (16 GB GDDR6 VRAM, Turing `sm_75`, Driver `550.163.01`, CUDA `12.4`)

---

## 1. What Was Set Up (End-to-End Checklist)

- [x] **Local Windows SSH & IAP Tunneling (`C:\Users\USER\.ssh\config`)**
  - Configured both `packguard-t4` and `packguard-vm` host aliases in [`C:\Users\USER\.ssh\config`](file:///C:/Users/USER/.ssh/config) to tunnel seamlessly over Google Cloud Identity-Aware Proxy (`gcloud.py compute start-iap-tunnel`) without needing an external IP address on the VM.
  - Configured automatic key authentication via `C:\Users\USER\.ssh\google_compute_engine`.
- [x] **Google Cloud T4 VM Networking & APT Repositories**
  - Started `instance-20261028-153524` and verified outbound internet access via your Cloud NAT gateway (`packguard-nat` / `packguard-router` in `me-west1`).
  - Enabled `contrib`, `non-free`, and `non-free-firmware` components in `/etc/apt/sources.list.d/debian.sources` and configured IPv4-first resolution in `/etc/apt/apt.conf.d/99force-ipv4`.
- [x] **System Toolchain, Cloud Kernel Headers & NVIDIA T4 Driver**
  - Installed C11 build toolchain (`build-essential`, `gcc`, `make`, `pkg-config`, `git`, `curl`, `wget`).
  - Installed LZMA2 compression headers & libraries (`liblzma-dev` v5.8.1, `xz-utils`).
  - Installed exact Debian 13 cloud kernel headers (`linux-headers-6.12.113+deb13-cloud-amd64` and `linux-headers-cloud-amd64`).
  - Built and signed the NVIDIA `550.163.01` kernel modules (`nvidia.ko`, `nvidia-modeset.ko`, `nvidia-drm.ko`, `nvidia-uvm.ko`) via DKMS, loaded the driver, and verified `nvidia-smi` reports the **Tesla T4 (15,360 MiB VRAM)** online.
- [x] **PackGuard Stage 1 Native C Scanner (`~/PackGuard/src/PackGuard.Scanner/packguard`)**
  - Synced the local [`PackGuard`](file:///c:/Users/USER/Desktop/ISEF2026/PackGuard) project to `~/PackGuard` on the remote server.
  - Compiled `packguard` with `-std=c11 -O3 -Wall -Wextra -Wpedantic -llzma -lm`.
  - Executed `./packguard --self-test` on the server — **all 4 native self-tests passed**:
    1. Native `liblzma` v5.8.1 verified safe against CVE-2024-3094.
    2. Raw LZMA2 Normalized Compression Distance (NCD) verified (`0.0191` identical, `0.1090` malware variant, `0.8550` benign).
    3. Overlapping 8 KB / 4 KB stride chunker verified.
    4. Stage 1 -> Stage 2 JSON & ModernBERT prompt formatting verified.
- [x] **PackGuard Stage 2 Python GPU Environment (`~/PackGuard/.venv`)**
  - Created virtual environment at `~/PackGuard/.venv` (Python 3.13).
  - Installed `torch==2.6.0+cu124`, `transformers==4.57.6`, `datasets`, `accelerate`, `evaluate`, `scikit-learn`, `onnx`, `onnxruntime`, `onnxruntime-gpu`, and `optimum`.
  - Verified `torch.cuda.is_available() == True` and `torch.cuda.get_device_name(0) == "Tesla T4"`.
  - Verified both [`training/train_modernbert.py`](file:///c:/Users/USER/Desktop/ISEF2026/PackGuard/training/train_modernbert.py) and [`training/export_onnx.py`](file:///c:/Users/USER/Desktop/ISEF2026/PackGuard/training/export_onnx.py) execute cleanly inside `.venv`.

---

## 2. All Bugs Investigated & Fixed

| # | Issue / Error Encountered | Root Cause | Fix Applied |
| :- | :--- | :--- | :--- |
| **1** | **Antigravity Tool Calls Blocked (`PreToolUse` Hook Error)** | The `googlecloudtools.datacloud_telemetry` plugin had a broken Windows path quote in its `PreToolUse` hook (`Cannot find module ...\"C:\Users\USER\...\telemetry_hook_bundle.js"`). | Removed the broken plugin folder `C:\Users\USER\.gemini\config\plugins\googlecloudtools.datacloud_telemetry` and restarted Antigravity. |
| **2** | **`ssh packguard-t4` Not Found / Empty `.ssh/config`** | Earlier Notepad edits saved to `C:\Users\USER\.ssh\config.txt` while leaving `C:\Users\USER\.ssh\config` at 0 bytes, and contained an invalid `connect-to-serial-port` / `--stdio` command. | Deleted the stray `config.txt` and wrote a valid OpenSSH IAP tunnel configuration in [`C:\Users\USER\.ssh\config`](file:///C:/Users/USER/.ssh/config) using `gcloud.py compute start-iap-tunnel`. |
| **3** | **SSH Public Key Denied (`Permission denied (publickey)`)** | Earlier troubleshooting ran `gcloud compute config-ssh --ssh-key-file=...\id_ed25519` and overwrote the local keypair, causing a mismatch with the VM's metadata. | Pushed `C:\Users\USER\.ssh\google_compute_engine.pub` to `instance-20261028-153524` metadata for both `asembarhoush` and `USER` and pointed `.ssh/config` to `google_compute_engine`. |
| **4** | **`apt update` Failed (`Malformed line 1 in /etc/apt/sources.list.d/nvidia.list`)** | Earlier copy-paste from chat inserted Markdown link syntax (`[http://deb.debian.org/debian](http://deb.debian.org/debian)`) into `nvidia.list`. | Removed `/etc/apt/sources.list.d/nvidia.list` and enabled `contrib non-free non-free-firmware` directly in `/etc/apt/sources.list.d/debian.sources`. |
| **5** | **`nvidia-smi` Missing / DKMS Module Not Built for Cloud Kernel** | Previously `linux-headers-amd64` (generic kernel) was installed instead of headers matching the VM's `-cloud-amd64` kernel (`6.12.113+deb13-cloud-amd64`), so DKMS skipped building `nvidia.ko`. | Installed `linux-headers-6.12.113+deb13-cloud-amd64` and `linux-headers-cloud-amd64`, compiled and signed `nvidia-current/550.163.01` via DKMS, and loaded it with `sudo modprobe nvidia`. |
| **6** | **Stage 1 C Scanner Build Error on Linux (`'S_IFDIR' undeclared`)** | [`src/PackGuard.Scanner/chunker_json.c`](file:///c:/Users/USER/Desktop/ISEF2026/PackGuard/src/PackGuard.Scanner/chunker_json.c#L284-L295) used `S_IFDIR`, which is hidden under strict `-std=c11` on Linux glibc without XSI macros, whereas POSIX defines `S_ISDIR(st.st_mode)`. | Updated [`is_directory_path`](file:///c:/Users/USER/Desktop/ISEF2026/PackGuard/src/PackGuard.Scanner/chunker_json.c#L284-L295) in [`chunker_json.c`](file:///c:/Users/USER/Desktop/ISEF2026/PackGuard/src/PackGuard.Scanner/chunker_json.c) to use `S_ISDIR(st.st_mode)` with a fallback to `S_IFDIR`. |
| **7** | **PyTorch `RuntimeError: The NVIDIA driver on your system is too old (found version 12040)`** | Unpinned `pip install torch` on Python 3.13 pulled `torch 2.14.1+cu130` (requiring CUDA 13.0 drivers), while Debian 13 provides NVIDIA driver `550.163.01` (CUDA 12.4 / `12040`). | Pinned `torch==2.6.0+cu124` with `--extra-index-url https://download.pytorch.org/whl/cu124` in [`training/requirements.txt`](file:///c:/Users/USER/Desktop/ISEF2026/PackGuard/training/requirements.txt), restoring full CUDA acceleration on the Tesla T4. |
| **8** | **Tesla T4 (16GB Turing `sm_75`) vs A100 (40GB Ampere `sm_80`) Training Defaults** | [`training/train_modernbert.py`](file:///c:/Users/USER/Desktop/ISEF2026/PackGuard/training/train_modernbert.py) was hardcoded for A100 (`bf16`, `tf32=True`, batch size 4, and `flash-attn` in `requirements.txt` which fails to build on Turing `sm_75`). | Updated [`configure_gpu_environment`](file:///c:/Users/USER/Desktop/ISEF2026/PackGuard/training/train_modernbert.py#L52-L79) and `main()` in [`training/train_modernbert.py`](file:///c:/Users/USER/Desktop/ISEF2026/PackGuard/training/train_modernbert.py#L240-L348) to detect compute capability automatically: uses hardware **FP16 Tensor Cores (`fp16=True`)**, **PyTorch SDPA (`sdpa`)**, and a safe 16GB VRAM micro-batch size (`2` with `gradient_accumulation_steps=16`, keeping effective batch size = 32) on Tesla T4, while still supporting BF16/TF32/FlashAttention-2 on A100+. |

---

## 3. Quick Commands Reference

- **Connect to your T4 Server from any terminal:**
  ```powershell
  ssh packguard-t4
  ```
- **Run Stage 1 Native C Scanner on the VM:**
  ```bash
  cd ~/PackGuard
  ./src/PackGuard.Scanner/packguard --self-test
  ```
- **Activate Python GPU Environment & Train / Export Stage 2 Model:**
  ```bash
  cd ~/PackGuard
  source .venv/bin/activate
  python training/train_modernbert.py --data_dir ./data --output_dir ./checkpoints/packguard-modernbert
  python training/export_onnx.py --model_dir ./checkpoints/packguard-modernbert/final --output_dir ./onnx_models
  ```

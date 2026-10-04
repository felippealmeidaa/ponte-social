import subprocess
import sys
import os
import time

def main():
    print("=" * 70)
    print(" INICIANDO PLATAFORMA CRM SOCIAL & IA OMNICHANNEL (DEV MODE)")
    print("=" * 70)
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Inicia o Backend FastAPI
    print("\n[1/2] Iniciando Backend FastAPI na porta 8000...")
    backend_env = os.environ.copy()
    backend_env["PYTHONPATH"] = os.path.join(base_dir, "backend")
    
    backend_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000", "--host", "0.0.0.0"],
        cwd=os.path.join(base_dir, "backend"),
        env=backend_env
    )
    
    # 2. Inicia o Frontend Vite React
    print("[2/2] Iniciando Frontend React (Vite) na porta 5173...")
    frontend_proc = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=os.path.join(base_dir, "frontend"),
        shell=True
    )
    
    print("\n" + "=" * 70)
    print(" SISTEMA EM EXECUÇÃO:")
    print(" -> Frontend Web: http://localhost:5173")
    print(" -> Backend API & Swagger: http://localhost:8000/docs")
    print(" Pressione Ctrl+C para encerrar os serviços.")
    print("=" * 70)
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nEncerrando processos...")
        backend_proc.terminate()
        frontend_proc.terminate()
        print("Serviços finalizados.")

if __name__ == "__main__":
    main()

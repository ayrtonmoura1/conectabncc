"""
Script para baixar o modelo Xenova/all-MiniLM-L6-v2 localmente
---------------------------------------------------------------
Salva todos os arquivos necessários do modelo ONNX na pasta ./models/all-MiniLM-L6-v2/
permitindo que a aplicação frontend carregue o modelo 100% de arquivos locais,
sem depender de conexões externas com o Hugging Face durante o uso.
"""

import os
import sys
import ssl
import urllib.request

# Evita erros de encoding no console do Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def baixar_modelo():
    ctx = ssl._create_unverified_context()
    base_url = 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/'
    target_dir = os.path.join('models', 'Xenova', 'all-MiniLM-L6-v2')
    os.makedirs(os.path.join(target_dir, 'onnx'), exist_ok=True)

    arquivos = [
        'config.json',
        'tokenizer.json',
        'tokenizer_config.json',
        'special_tokens_map.json',
        'onnx/model_quantized.onnx'
    ]

    print("=" * 60)
    print(f"Baixando arquivos do modelo para: {target_dir}")
    print("=" * 60)

    for item in arquivos:
        dest_path = os.path.join(target_dir, item)
        url = base_url + item
        print(f"-> Baixando {item}...")

        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx) as resp, open(dest_path, 'wb') as out_f:
            total_bytes = int(resp.headers.get('Content-Length', 0))
            baixados = 0
            chunk_size = 1024 * 128
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                out_f.write(chunk)
                baixados += len(chunk)
                if total_bytes > 0 and baixados % (1024 * 1024 * 4) < chunk_size:
                    progresso = (baixados / total_bytes) * 100
                    print(f"   {baixados / (1024*1024):.1f} MB / {total_bytes / (1024*1024):.1f} MB ({progresso:.1f}%)")

        tamanho_mb = os.path.getsize(dest_path) / (1024 * 1024)
        print(f"[OK] {item} ({tamanho_mb:.2f} MB)")

    print("=" * 60)
    print("Download do modelo concluído com sucesso!")
    print("=" * 60)

if __name__ == '__main__':
    baixar_modelo()

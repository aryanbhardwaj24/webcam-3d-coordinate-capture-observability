FROM python:3.10-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --default-timeout=1000 --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple torch==2.2.2 torchvision==0.17.2
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend/app /app/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

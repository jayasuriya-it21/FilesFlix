import os
import logging
from waitress import serve
from app import app

# Setup logging
logging.basicConfig(
    filename="logs/file_flix.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info("Starting FileFlix server on http://0.0.0.0:5000")
    try:
        # Ensure logs directory exists
        os.makedirs("logs", exist_ok=True)
        # Run server on all interfaces (0.0.0.0) at port 5000
        serve(app, host="0.0.0.0", port=5000, threads=8)
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        raise
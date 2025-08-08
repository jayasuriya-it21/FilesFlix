#!/bin/bash

# FilesFlix Startup Script
# This script helps set up and run FilesFlix with proper configuration

set -e  # Exit on any error

echo "🎬 FilesFlix - Starting Up..."

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | grep -Po '(?<=Python )(.+)')
echo "📋 Python Version: $PYTHON_VERSION"

# Check for virtual environment
if [ -z "$VIRTUAL_ENV" ]; then
    echo "⚠️  Warning: No virtual environment detected. Consider using one for better dependency management."
fi

# Install dependencies if requirements.txt is newer than last install
if [ ! -f ".deps_installed" ] || [ "requirements.txt" -nt ".deps_installed" ]; then
    echo "📦 Installing/Updating dependencies..."
    pip install -r requirements.txt
    touch .deps_installed
else
    echo "📦 Dependencies up to date"
fi

# Check for environment configuration
if [ ! -f ".env" ]; then
    echo "⚙️  No .env file found. Creating from template..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "📝 Please edit .env with your settings before running in production"
    else
        echo "❌ No .env.example found. Please create .env manually."
    fi
fi

# Check FFmpeg availability
if command -v ffmpeg &> /dev/null; then
    FFMPEG_VERSION=$(ffmpeg -version 2>&1 | head -n1 | grep -Po '(?<=ffmpeg version )([^\\s]+)')
    echo "🎥 FFmpeg Version: $FFMPEG_VERSION"
else
    echo "⚠️  Warning: FFmpeg not found. Video processing will be limited."
    echo "   Install FFmpeg for full functionality: https://ffmpeg.org/download.html"
fi

# Create necessary directories
echo "📁 Creating cache directories..."
mkdir -p logs cache/thumbnails cache/hls cache/metadata

# Check for security configuration
if grep -q "your-secret-key-here" .env 2>/dev/null; then
    echo "🔐 Warning: Please set a secure SECRET_KEY in your .env file"
fi

if grep -q "password123" .env 2>/dev/null; then
    echo "🔐 Warning: Please change the default password in your .env file"
fi

# Set default values if not in environment
export HOST=${HOST:-"0.0.0.0"}
export PORT=${PORT:-"5000"}

echo ""
echo "🚀 Starting FilesFlix server..."
echo "   Client interface: http://$HOST:$PORT"
echo "   Host dashboard: http://$HOST:$PORT/host"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the application
python app.py
"""
Vercel Serverless Function Entrypoint for Google Course Builder API.
Maps all /api/* routes directly to CourseBuilderAPIHandler without external proxies.
"""

import sys
import os

# Ensure project root is available for imports
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from api_server import CourseBuilderAPIHandler

class handler(CourseBuilderAPIHandler):
    """Standard Vercel serverless HTTP handler."""
    pass

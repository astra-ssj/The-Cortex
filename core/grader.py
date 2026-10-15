# core/grader.py — Re-export from root grader.py for core package integration.

from grader import GradingResult, evaluate_decision

__all__ = ["GradingResult", "evaluate_decision"]

"""
Cost calculation utilities for OpenAI API usage.

Tracks token usage and calculates costs based on model pricing.
"""
from typing import Dict, Optional
from schemas.enrichment import TokenUsage


# OpenAI pricing (as of January 2025, in USD per 1M tokens)
PRICING = {
    "gpt-4o-mini-2024-07-18": {
        "input": 0.150,   # $0.15 per 1M input tokens
        "output": 0.600,  # $0.60 per 1M output tokens
    },
    "gpt-4o-mini": {  # Alias
        "input": 0.150,
        "output": 0.600,
    },
    "gpt-3.5-turbo": {
        "input": 0.500,   # $0.50 per 1M input tokens
        "output": 1.500,  # $1.50 per 1M output tokens
    },
    "text-embedding-3-small": {
        "input": 0.020,   # $0.02 per 1M tokens
        "output": 0.0,    # No output tokens for embeddings
    },
}


def calculate_cost(
    model_name: str,
    token_usage: TokenUsage
) -> Dict[str, float]:
    """
    Calculate cost for an API call.

    Args:
        model_name: OpenAI model name
        token_usage: Token usage data from API response

    Returns:
        Dictionary with input_cost, output_cost, and total_cost in USD

    Raises:
        ValueError: If model pricing is not found
    """
    pricing = PRICING.get(model_name)
    if not pricing:
        # Try to extract base model name (e.g., "gpt-4o-mini-2024-07-18" -> "gpt-4o-mini")
        base_model = model_name.split("-202")[0] if "-202" in model_name else model_name
        pricing = PRICING.get(base_model)

    if not pricing:
        raise ValueError(f"Pricing not found for model: {model_name}")

    input_cost = (token_usage.prompt_tokens / 1_000_000) * pricing["input"]
    output_cost = (token_usage.completion_tokens / 1_000_000) * pricing["output"]
    total_cost = input_cost + output_cost

    return {
        "input_cost": round(input_cost, 6),
        "output_cost": round(output_cost, 6),
        "total_cost": round(total_cost, 6),
    }


def calculate_embedding_cost(
    model_name: str,
    tokens_used: int
) -> float:
    """
    Calculate cost for embedding generation.

    Args:
        model_name: Embedding model name
        tokens_used: Number of tokens processed

    Returns:
        Cost in USD
    """
    pricing = PRICING.get(model_name)
    if not pricing:
        raise ValueError(f"Pricing not found for embedding model: {model_name}")

    cost = (tokens_used / 1_000_000) * pricing["input"]
    return round(cost, 6)


def estimate_tokens(text: str) -> int:
    """
    Estimate token count for text (rough approximation).

    Uses the rule of thumb: 1 token ≈ 4 characters for English text.

    Args:
        text: Input text

    Returns:
        Estimated token count
    """
    return len(text) // 4


def format_cost(cost_usd: float) -> str:
    """
    Format cost for display.

    Args:
        cost_usd: Cost in USD

    Returns:
        Formatted string (e.g., "$0.0123" or "$0.000001")
    """
    if cost_usd >= 0.01:
        return f"${cost_usd:.4f}"
    elif cost_usd >= 0.0001:
        return f"${cost_usd:.6f}"
    else:
        return f"${cost_usd:.8f}"

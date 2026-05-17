from typing import List


def get_even_numbers(numbers: List[int]) -> List[int]:
    """Return only the even numbers from the input list."""
    return [num for num in numbers if num % 2 == 0]

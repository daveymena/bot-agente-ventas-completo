from typing import List


def filter_even_numbers(numbers: List[int]) -> List[int]:
    """Filtra y retorna solo los números pares de una lista.

    Args:
        numbers: Lista de números enteros.

    Returns:
        Lista con los números pares en el orden original.
    """
    return [num for num in numbers if num % 2 == 0]

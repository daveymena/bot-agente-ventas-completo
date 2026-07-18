export type ToneStyle =
  | "warm_professional"
  | "energetic"
  | "inspiring"
  | "formal"
  | "friendly_casual"
  | "educational"
  | "luxury"
  | "technical";

export interface EmojiSet {
  greeting: string;
  product: string;
  benefit: string;
  price: string;
  delivery: string;
  guarantee: string;
  payment: string;
  urgency: string;
  success: string;
  question: string;
  separator: string;
}

export interface BrandPhrases {
  greeting_new: string;
  greeting_return: string;
  farewell: string;
  waiting: string;
  thank_you: string;
  no_product: string;
  objection_handle: string;
}

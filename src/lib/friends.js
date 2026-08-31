export function shouldShowFriends(friends) {
  return Array.isArray(friends) && friends.length > 0;
}

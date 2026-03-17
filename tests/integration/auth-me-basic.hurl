############################################################
# GET /api/auth/me — Basic Auth (dev/tests) should succeed
############################################################

GET http://localhost:8080/api/auth/me
[BasicAuth]
test-user1@fincraft-testing.com:test-password1

HTTP/1.1 200
[Asserts]
jsonpath "$.user.userName" == "test-user1@fincraft-testing.com"
jsonpath "$.user._id" matches "^[0-9a-f]{24}$"

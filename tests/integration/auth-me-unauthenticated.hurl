############################################################
# GET /api/auth/me — unauthenticated request must be rejected
############################################################

GET http://localhost:8080/api/auth/me

HTTP/1.1 401

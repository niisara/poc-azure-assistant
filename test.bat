@echo off
curl -X POST ^
  http://localhost:3000/api/llm/completion ^
  -H "Content-Type: application/json" ^
  -d "{\"prompt\": \"Write a short paragraph explaining how cloud computing has transformed business operations in the last decade.\"}"



echo.
echo.
echo.
echo.
echo All tests completed
echo ===================================================================

pause